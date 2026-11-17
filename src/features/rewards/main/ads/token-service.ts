import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { RewardsState } from '../../../../shared/contracts/rewards';
import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import { BrowserError } from '../../../../shared/errors';
import type { RewardsStored } from '../rewards-repository';
import type { AdsTokenCryptoPort, BlindedTokenBatch } from './crypto-port';
import type { AdsTokenProviderPort } from './token-provider';
import { AdsTokenRepository, type PendingTokenBatch } from './token-repository';

export class AdsTokenService {
  private readonly running = new Map<string, AbortController>();
  private disposed = false;
  constructor(private readonly runtime: FeatureRuntime, private readonly crypto: AdsTokenCryptoPort,
    private readonly provider: AdsTokenProviderPort, private readonly rewards: (profileId: string) => RewardsStored,
    private readonly notify: (profileId: string) => RewardsState) {}

  configure(context: BrowserContext, endpoint: string, issuerPublicKeys: string[]): RewardsState {
    this.regular(context);
    if (this.running.has(context.profileId)) throw new BrowserError('CONFLICT', '请先取消token请求');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) throw new BrowserError('INVALID_ARGUMENT', '广告服务必须是HTTPS地址');
    if (!issuerPublicKeys.length || issuerPublicKeys.some(key => Buffer.from(key, 'base64').length !== 32)) throw new BrowserError('INVALID_ARGUMENT', 'issuer公钥必须是可信来源的32字节Ristretto公钥');
    this.repository(context.profileId).configure({ endpoint: url.origin, issuerPublicKeys: [...new Set(issuerPublicKeys)] });
    return this.notify(context.profileId);
  }

  state(profileId: string): Pick<RewardsState['ads'], 'tokenStatus' | 'tokenCount' | 'error'> {
    const repository = this.repository(profileId);
    const pending = repository.pending();
    return {
      tokenCount: repository.count(),
      tokenStatus: this.running.has(profileId) ? pending?.nonce ? 'awaiting-signature' : 'requesting'
        : pending?.status === 'failed' ? 'failed' : repository.count() > 0 ? 'ready' : 'empty',
      error: pending?.error ?? (pending && !this.running.has(profileId) ? '上次token批次尚未完成，重新请求将凭已保存nonce继续；没有nonce时保留未知结果' : undefined),
    };
  }

  async refill(context: BrowserContext): Promise<RewardsState> {
    this.regular(context);
    const profileId = context.profileId;
    if (this.running.has(profileId)) throw new BrowserError('CONFLICT', '已有广告token请求');
    const reward = this.rewards(profileId);
    if (!reward.paymentId || !reward.seedCipher) throw new BrowserError('UNAVAILABLE', '请先注册Rewards钱包');
    if (!this.runtime.secrets.available()) throw new BrowserError('UNAVAILABLE', '系统密钥不可用，无法保存盲签token');
    const repository = this.repository(profileId);
    const configuration = repository.configuration();
    if (!configuration) throw new BrowserError('UNAVAILABLE', '请配置已获准的广告token服务和独立可信issuer公钥');
    const controller = new AbortController();
    this.running.set(profileId, controller);
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let pending = repository.pending();
    let seed: Buffer | undefined;
    try {
      await this.crypto.initialize();
      if (controller.signal.aborted) throw new BrowserError('CANCELLED', 'token请求已取消');
      let batch: BlindedTokenBatch;
      if (pending) {
        if (!pending.nonce) throw new BrowserError('CONFLICT', '上次提交结果未知且未取得nonce；保留批次，请恢复服务结果后再继续，避免重复提交');
        batch = JSON.parse(this.runtime.secrets.decrypt(pending.batchCipher)) as BlindedTokenBatch;
      } else {
        batch = this.crypto.create(50);
        pending = {
          id: randomUUID(), batchCipher: this.runtime.secrets.encrypt(JSON.stringify(batch)), nonce: null,
          status: 'requesting', createdAt: Date.now(),
        };
        repository.saveBatch(pending); this.notify(profileId);
        seed = Buffer.from(this.runtime.secrets.decrypt(reward.seedCipher), 'hex');
        const nonce = await this.provider.request(configuration.endpoint, reward.paymentId, seed, batch.blindedTokens, controller.signal);
        if (controller.signal.aborted) throw new BrowserError('CANCELLED', 'token请求已取消');
        pending = { ...pending, nonce, status: 'awaiting-signature', error: undefined };
        repository.saveBatch(pending); this.notify(profileId);
      }
      const signed = await this.provider.fetch(configuration.endpoint, reward.paymentId, pending.nonce!, controller.signal);
      if (!configuration.issuerPublicKeys.includes(signed.publicKey)) throw new BrowserError('FORBIDDEN', '签名响应的issuer不在独立可信公钥名单中，已拒绝token');
      const unblinded = this.crypto.verifyAndUnblind(batch, signed);
      if (controller.signal.aborted || this.disposed) throw new BrowserError('CANCELLED', 'token请求已取消');
      repository.commit(pending.id, unblinded.map(token => ({
        id: randomUUID(), tokenCipher: this.runtime.secrets.encrypt(token), publicKey: signed.publicKey, consumed: false,
      })));
    } catch (error) {
      if (!this.disposed && pending) repository.saveBatch({
        ...pending, status: 'failed',
        error: controller.signal.aborted ? 'token请求取消或超时；已保留批次与nonce，未将未知结果标为成功' : error instanceof Error ? error.message : 'token请求失败',
      });
      if (!pending) throw error;
    } finally {
      seed?.fill(0); clearTimeout(timeout); this.running.delete(profileId);
      if (!this.disposed) this.notify(profileId);
    }
    return this.notify(profileId);
  }

  cancel(profileId: string): void { this.running.get(profileId)?.abort(); }
  dispose(): void { this.disposed = true; for (const controller of this.running.values()) controller.abort(); this.running.clear(); }
  private repository(profileId: string) { return new AdsTokenRepository(this.runtime.storage.open(profileId)); }
  private regular(context: BrowserContext): void { if (context.isPrivate) throw new BrowserError('FORBIDDEN', '私密窗口不能请求广告token'); }
}
