import type { RewardsProviderName, RewardsState } from '../../../../shared/contracts/rewards';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { CommandContext, FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { RewardsStored } from '../rewards-repository';
import type { RewardsWalletStatus } from '../provider-port';
import { BrowserError } from '../../../../shared/errors';
import { createOAuth } from './oauth-url';
import { RewardsOAuthTab } from './oauth-tab';
import { exchangeProviderCode } from './provider-exchange';
import { ExternalAccountRepository } from './external-repository';
import { ExternalAccountFlow } from './external-account-flow';
import { externalAccountState } from './external-state';

export class ExternalAccountController {
  private readonly running = new Map<string, AbortController>();
  private readonly oauth: RewardsOAuthTab;
  private readonly flow: ExternalAccountFlow;
  private disposed = false;
  private release?: () => void;
  constructor(private readonly runtime: FeatureRuntime, private readonly read: (profileId: string) => RewardsStored,
    private readonly notify: (profileId: string) => RewardsState) {
    this.oauth = new RewardsOAuthTab(runtime); this.flow = new ExternalAccountFlow(runtime, read, profileId => { if (!this.disposed) this.notify(profileId); });
  }
  start(): void {
    for (const profile of this.runtime.core.getProfiles()) {
      const repository = this.repository(profile.id); const account = repository.get();
      if (account && ['authorizing', 'preparing', 'claiming'].includes(account.status)) repository.save({ ...account, status: account.tokenCipher ? 'unknown' : 'failed', error: account.tokenCipher ? '上次连接在完成前退出，保留凭据可继续或查询账户状态' : '上次授权已失效，请重新登录' });
    }
    this.release = this.runtime.core.onEvent(event => { if (event.type === 'contextDisposed' && !event.context.isPrivate) this.cancel(event.context.profileId); });
  }
  state(profileId: string, state: RewardsState): RewardsState { return externalAccountState(state, this.repository(profileId).get()); }
  busy(profileId: string): boolean { return this.running.has(profileId); }
  observeWallet(profileId: string, wallet: RewardsWalletStatus): void {
    const repository = this.repository(profileId); const account = repository.get();
    if (!account?.tokenCipher || !account.address || this.running.has(profileId)) return;
    const matches = wallet.linked && wallet.provider?.name === account.provider && wallet.provider.id === account.address;
    if (matches && account.status !== 'connected') repository.save({ ...account, status: 'connected', error: undefined });
    else if (!matches && account.status === 'connected') repository.save({ ...account, status: 'unknown', balance: undefined, balanceAt: undefined, error: 'Rewards服务返回的当前收款绑定与本机记录不一致，请核实后继续' });
  }
  connect(context: CommandContext, provider: RewardsProviderName): RewardsState {
    this.regular(context); const rewards = this.read(context.profileId); const current = this.repository(context.profileId).get();
    if (rewards.account.status === 'pending') throw new BrowserError('CONFLICT', '请先结束自托管收款账户连接');
    if (!rewards.paymentId) throw new BrowserError('UNAVAILABLE', '请先注册Rewards钱包');
    if (!this.runtime.secrets.available()) throw new BrowserError('UNAVAILABLE', '系统密钥不可用，不能保存收款凭据');
    if (current && current.status !== 'signed-out' && (current.tokenCipher || current.status === 'connected')) throw new BrowserError('CONFLICT', '请先继续当前连接或在本机注销现有账户');
    if (rewards.linked && rewards.provider && rewards.provider !== provider) throw new BrowserError('CONFLICT', 'Rewards服务已有其他收款账户，请按官方流程解除或更换');
    const session = createOAuth(provider); const repository = this.repository(context.profileId);
    return this.launch(context, async signal => {
      repository.save({ provider, status: 'authorizing', updatedAt: Date.now() }); this.notify(context.profileId);
      const code = await this.oauth.authorize(context, session, signal);
      const token = await exchangeProviderCode(session, code, rewards.paymentId!, this.flow.operation(context, signal));
      if (this.disposed) throw new BrowserError('CANCELLED', '收款服务已关闭');
      const account = { provider, status: 'preparing' as const, tokenCipher: this.runtime.secrets.encrypt(token.token), address: token.address,
        linkingCipher: token.linkingInfo ? this.runtime.secrets.encrypt(token.linkingInfo) : undefined, updatedAt: Date.now() };
      repository.save(account); this.notify(context.profileId);
      if (signal.aborted) throw new BrowserError('CANCELLED', '收款授权已取消，已取得的凭据保留以便继续');
      await this.flow.connect(context, account, signal);
    });
  }
  resume(context: BrowserContext): RewardsState {
    this.regular(context); const account = this.repository(context.profileId).get();
    if (!account?.tokenCipher || account.status === 'signed-out') throw new BrowserError('UNAVAILABLE', '没有可恢复的连接材料');
    return this.launch(context, signal => account.status === 'connected' ? this.flow.balance(context, signal) : this.flow.connect(context, account, signal));
  }
  balance(context: BrowserContext): RewardsState { this.regular(context); return this.launch(context, signal => this.flow.balance(context, signal)); }
  signOut(context: BrowserContext): RewardsState {
    this.regular(context);
    if (this.running.has(context.profileId)) throw new BrowserError('CONFLICT', '请先取消当前账户操作');
    this.repository(context.profileId).signOut(); return this.notify(context.profileId);
  }
  cancel(profileId: string): void { this.running.get(profileId)?.abort(); }
  dispose(): void { this.disposed = true; this.flow.dispose(); this.release?.(); for (const controller of this.running.values()) controller.abort(); }
  private launch(context: BrowserContext, operation: (signal: AbortSignal) => Promise<void>): RewardsState {
    if (this.running.has(context.profileId)) throw new BrowserError('CONFLICT', '收款账户操作尚未结束');
    const controller = new AbortController(); this.running.set(context.profileId, controller);
    const timer = setTimeout(() => controller.abort(), 10 * 60_000);
    void operation(controller.signal).catch(error => {
      if (this.disposed || !this.runtime.core.getProfiles().some(profile => profile.id === context.profileId)) return;
      const repository = this.repository(context.profileId); const current = repository.get();
      const expired = error instanceof BrowserError && error.details?.status === 401;
      if (current) repository.save({ ...current, status: expired ? 'failed' : current.status === 'connected' ? 'connected' : current.tokenCipher ? 'unknown' : 'failed',
        tokenCipher: expired ? undefined : current.tokenCipher, linkingCipher: expired ? undefined : current.linkingCipher,
        error: controller.signal.aborted ? '账户操作已取消或超时；已发送请求仍可能被服务处理' : error instanceof Error ? error.message : '收款账户操作失败',
        balance: current.status === 'connected' ? undefined : current.balance, balanceAt: current.status === 'connected' ? undefined : current.balanceAt });
    }).finally(() => { clearTimeout(timer); this.running.delete(context.profileId); if (!this.disposed) this.notify(context.profileId); });
    return this.notify(context.profileId);
  }
  private repository(profileId: string) { return new ExternalAccountRepository(this.runtime.storage.open(profileId)); }
  private regular(context: BrowserContext): void { if (context.isPrivate || context.kind === 'tor') throw new BrowserError('FORBIDDEN', '收款账户只在普通资料中连接'); }
}
