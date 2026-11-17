import { randomBytes, randomUUID } from 'node:crypto';
import type { RewardsState } from '../../../shared/contracts/rewards';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { BraveRewardsProvider } from './brave-provider';
import { NodeRewardsSigner } from './wallet-signer';
import { RewardsRepository, type RewardsStored } from './rewards-repository';
import type { RewardsProviderPort } from './provider-port';
import { SelfCustodyController } from './self-custody-controller';
import { SolanaBatBalanceAdapter } from './solana-balance-adapter';

export class RewardsService {
  private readonly running = new Map<string, { controller: AbortController; id: string }>();
  private disposed = false;
  private readonly selfCustody;
  private readonly balanceProvider = new SolanaBatBalanceAdapter();
  constructor(private readonly runtime: FeatureRuntime, private readonly provider: RewardsProviderPort = new BraveRewardsProvider(new NodeRewardsSigner())) {
    this.selfCustody = new SelfCustodyController(runtime, provider, profileId => this.repository(profileId).get(),
      (profileId, status) => {
        const stored = this.repository(profileId).get();
        this.save(profileId, { ...stored, provider: status.provider?.name ?? null, providerId: status.provider?.id ?? null,
          linked: status.linked, availableSelfCustody: status.selfCustodyAvailable,
          selfCustodyAvailable: Boolean(status.selfCustodyAvailable.solana),
          account: { status: status.linked ? 'connected' : 'pending', provider: status.provider?.name },
        });
      },
      (profileId, message) => {
        const stored = this.repository(profileId).get();
        this.save(profileId, { ...stored, account: { ...stored.account, status: stored.linked ? 'connected' : 'unconnected', message }, error: message });
      });
  }

  start(): void {
    for (const profile of this.runtime.core.getProfiles()) {
      const repository = this.repository(profile.id);
      const stored = repository.get();
      if (stored.status === 'registering' || stored.status === 'refreshing') repository.save({
        ...stored, status: 'failed', error: '上次请求在完成前退出；服务结果可能未知，请保留钱包资料并查询账户状态',
      });
    }
  }

  get(context: BrowserContext): RewardsState { this.regular(context); return this.publicState(this.repository(context.profileId).get()); }

  configure(context: BrowserContext, endpoint: string, serviceKey?: string, solanaRpcUrl?: string): RewardsState {
    this.regular(context);
    if (this.running.has(context.profileId)) throw new BrowserError('CONFLICT', '请先取消正在进行的Rewards请求');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new BrowserError('INVALID_ARGUMENT', 'Rewards服务地址必须是无凭据的HTTPS地址');
    if (!this.runtime.secrets.available()) throw new BrowserError('UNAVAILABLE', '系统密钥服务不可用，不能保存Rewards凭据');
    const repository = this.repository(context.profileId);
    const stored = repository.get();
    if (stored.paymentId && stored.endpoint && new URL(stored.endpoint).origin !== url.origin) throw new BrowserError('CONFLICT', '已注册钱包不能直接更换服务来源，请保留原资料');
    const serviceKeyCipher = serviceKey === undefined ? stored.serviceKeyCipher : serviceKey ? this.runtime.secrets.encrypt(serviceKey) : null;
    if (solanaRpcUrl) {
      const rpc = new URL(solanaRpcUrl);
      if (rpc.protocol !== 'https:' || rpc.username || rpc.password) throw new BrowserError('INVALID_ARGUMENT', 'Solana RPC必须是有效HTTPS地址');
    }
    return this.save(context.profileId, {
      ...stored, endpoint: url.origin, serviceKeyCipher, hasServiceKey: Boolean(serviceKeyCipher),
      status: stored.paymentId ? 'registered' : 'ready', error: undefined,
      solanaRpcUrl: solanaRpcUrl ?? stored.solanaRpcUrl,
    });
  }

  async register(context: BrowserContext, country: string): Promise<RewardsState> {
    this.regular(context);
    const repository = this.repository(context.profileId);
    let stored = repository.get();
    if (stored.paymentId) throw new BrowserError('CONFLICT', 'Rewards钱包已注册，请刷新状态');
    if (!stored.endpoint) throw new BrowserError('INVALID_ARGUMENT', '请先配置已获资格的Rewards服务');
    if (!this.runtime.secrets.available()) throw new BrowserError('UNAVAILABLE', '系统密钥服务不可用，无法建立Rewards钱包');
    if (!stored.seedCipher) {
      const seed = randomBytes(32);
      try { stored = repository.save({ ...stored, seedCipher: this.runtime.secrets.encrypt(seed.toString('hex')) }); }
      finally { seed.fill(0); }
    }
    return this.perform(context.profileId, 'registering', async (record, seed, signal) => {
      const result = await this.provider.register(this.configuration(record), seed, country, signal);
      return { ...record, paymentId: result.paymentId, country, status: 'registered', error: undefined };
    });
  }

  async refresh(context: BrowserContext): Promise<RewardsState> {
    this.regular(context);
    const stored = this.repository(context.profileId).get();
    if (!stored.paymentId) throw new BrowserError('INVALID_ARGUMENT', '尚未注册Rewards钱包');
    return this.perform(context.profileId, 'refreshing', async (record, seed, signal) => {
      const result = await this.provider.wallet(this.configuration(record), seed, record.paymentId!, signal);
      let balance = record.balance;
      if (result.linked && result.provider?.name === 'solana' && record.solanaRpcUrl) {
        const amount = await this.balanceProvider.fetch(record.solanaRpcUrl, result.provider.id, signal);
        balance = { amount, currency: 'BAT', status: 'confirmed', updatedAt: Date.now() };
      } else balance = { amount: null, currency: 'BAT', status: 'unknown', updatedAt: null };
      return {
        ...record, status: 'registered', provider: result.provider?.name ?? null, linked: result.linked,
        providerId: result.provider?.id ?? null, availableSelfCustody: result.selfCustodyAvailable,
        selfCustodyAvailable: Boolean(result.selfCustodyAvailable.solana), balance,
        account: { status: result.linked ? 'connected' : 'unconnected', provider: result.provider?.name },
        error: undefined,
      };
    });
  }

  cancel(context: BrowserContext): RewardsState {
    this.regular(context);
    this.selfCustody.cancel(context.profileId);
    this.running.get(context.profileId)?.controller.abort();
    const current = this.repository(context.profileId).get();
    if (this.running.has(context.profileId)) return this.save(context.profileId, {
      ...current, status: 'cancelled', error: '请求已取消；已发出的注册请求仍可能被服务处理，钱包种子已保留',
    });
    return current.account.status === 'pending'
      ? this.save(context.profileId, { ...current, account: { ...current.account, status: 'unconnected', message: '收款连接等待已取消' } })
      : this.publicState(current);
  }

  async connectSelfCustody(context: CommandContext): Promise<RewardsState> {
    this.regular(context);
    if (this.running.has(context.profileId)) throw new BrowserError('CONFLICT', '请先等待当前Rewards请求结束');
    const stored = this.repository(context.profileId).get();
    if (!stored.seedCipher) throw new BrowserError('UNAVAILABLE', 'Rewards钱包尚未注册');
    const seed = Buffer.from(this.runtime.secrets.decrypt(stored.seedCipher), 'hex');
    try { await this.selfCustody.connect(context, seed); }
    finally { seed.fill(0); }
    return this.save(context.profileId, { ...stored, account: { status: 'pending', provider: 'solana', message: '请在官方连接页面完成操作；等待服务确认' }, error: undefined });
  }

  dispose(): void { this.disposed = true; this.selfCustody.dispose(); for (const operation of this.running.values()) operation.controller.abort(); this.running.clear(); }

  private async perform(profileId: string, status: 'registering' | 'refreshing',
    operation: (record: RewardsStored, seed: Uint8Array, signal: AbortSignal) => Promise<RewardsStored>): Promise<RewardsState> {
    if (this.running.has(profileId)) throw new BrowserError('CONFLICT', '已有Rewards请求正在进行');
    const controller = new AbortController();
    const id = randomUUID();
    this.running.set(profileId, { controller, id });
    const repository = this.repository(profileId);
    const stored = repository.get();
    if (!stored.seedCipher) { this.running.delete(profileId); throw new BrowserError('UNAVAILABLE', 'Rewards钱包种子不存在'); }
    this.save(profileId, { ...stored, status, lastRequestId: id, error: undefined });
    const timer = setTimeout(() => controller.abort(), 30_000);
    let seed: Buffer | undefined;
    try {
      seed = Buffer.from(this.runtime.secrets.decrypt(stored.seedCipher), 'hex');
      const next = await operation({ ...stored, lastRequestId: id }, seed, controller.signal);
      if (controller.signal.aborted || this.disposed) throw new BrowserError('CANCELLED', 'Rewards请求已取消');
      return this.save(profileId, next);
    } catch (error) {
      if (this.disposed) throw error;
      const message = controller.signal.aborted ? 'Rewards请求已取消或超时，服务结果可能未知，已保留钱包资料' : error instanceof Error ? error.message : 'Rewards请求失败';
      return this.save(profileId, {
        ...repository.get(), status: controller.signal.aborted ? 'cancelled' : error instanceof BrowserError && error.code === 'FORBIDDEN' ? 'needs-authorization' : 'failed',
        error: message,
      });
    } finally { seed?.fill(0); clearTimeout(timer); this.running.delete(profileId); }
  }

  private configuration(stored: RewardsStored) {
    return { grantEndpoint: stored.endpoint, serviceKey: stored.serviceKeyCipher ? this.runtime.secrets.decrypt(stored.serviceKeyCipher) : undefined };
  }
  private repository(profileId: string) { return new RewardsRepository(this.runtime.storage.open(profileId)); }
  private regular(context: BrowserContext): void { if (context.isPrivate) throw new BrowserError('FORBIDDEN', 'Rewards账户管理仅在普通窗口中提供'); }
  private publicState(stored: RewardsStored): RewardsState {
    const { serviceKeyCipher, seedCipher, providerId, availableSelfCustody, ...state } = stored;
    return state;
  }
  private save(profileId: string, stored: RewardsStored): RewardsState {
    const state = this.publicState(this.repository(profileId).save(stored));
    this.runtime.publish('rewards.changed', state, { profileId });
    return state;
  }
}
