import { randomInt, randomUUID } from 'node:crypto';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import { BrowserError } from '../../../../shared/errors';
import type { AdsTokenCryptoPort } from './crypto-port';
import type { AdsConfirmationProviderPort } from './confirmation-provider';
import { AdsDeliveryRepository } from './delivery-repository';
import { contextAdsFetch } from './ads-fetch';

export class AdsPaymentService {
  private readonly running = new Map<string, AbortController>();
  private disposed = false;
  constructor(private readonly runtime: FeatureRuntime, private readonly crypto: AdsTokenCryptoPort,
    private readonly provider: AdsConfirmationProviderPort, private readonly notify: (profileId: string) => void) {}
  busy(profileId: string): boolean { return this.running.has(profileId); }
  async redeem(context: BrowserContext, paymentId: string): Promise<void> {
    if (this.running.has(context.profileId)) throw new BrowserError('CONFLICT', '广告token正在兑换');
    const repository = new AdsDeliveryRepository(this.runtime.storage.open(context.profileId));
    const controller = new AbortController(); this.running.set(context.profileId, controller);
    const timer = setTimeout(() => controller.abort(), 45_000);
    let batch = repository.redemption();
    try {
      await this.crypto.initialize();
      if (this.disposed || controller.signal.aborted) throw new BrowserError('CANCELLED', '广告兑换已暂停');
      if (!batch || batch.status === 'confirmed') {
        const tokens = repository.payments();
        if (!tokens.length) throw new BrowserError('INVALID_ARGUMENT', '没有可兑换的payment token');
        const payload = JSON.stringify({ paymentId });
        const counts: Record<string, string | number> = { ad_format: 'ad_notification' };
        const credentials = tokens.map(token => {
          const signed = this.crypto.credential(this.runtime.secrets.decrypt(token.tokenCipher), payload);
          counts[token.type] = Number(counts[token.type] ?? 0) + 1;
          return { confirmationType: token.type, credential: { signature: signed.signature, t: signed.tokenPreimage }, publicKey: token.publicKey };
        });
        batch = { id: randomUUID(), tokenIds: tokens.map(token => token.id), bodyCipher: this.runtime.secrets.encrypt(JSON.stringify({ paymentCredentials: credentials, payload, platform: 'macos', totals: [counts] })), status: 'pending', createdAt: Date.now() };
        repository.saveRedemption(batch);
      }
      this.notify(context.profileId);
      await this.provider.redeem(paymentId, this.runtime.secrets.decrypt(batch.bodyCipher), contextAdsFetch(this.runtime, context), controller.signal);
      if (this.disposed) return;
      repository.redeemed(batch);
      repository.configure({ ...repository.settings(), nextRedemptionAt: Date.now() + 86_400_000 * (0.5 + randomInt(0, 0x1000000) / 0x1000000) });
    } catch (error) {
      if (!this.disposed && batch && batch.status !== 'confirmed') {
        repository.saveRedemption({ ...batch, status: error instanceof BrowserError && !error.recoverable && !controller.signal.aborted ? 'failed' : 'unknown', error: controller.signal.aborted ? '兑换请求已取消或超时，保留原批次；结果仍可能被服务处理' : error instanceof Error ? error.message : '兑换结果未知' });
        repository.configure({ ...repository.settings(), nextRedemptionAt: Date.now() + 3_600_000 });
      }
      throw error;
    } finally { clearTimeout(timer); this.running.delete(context.profileId); if (!this.disposed) this.notify(context.profileId); }
  }
  cancel(profileId: string): void { this.running.get(profileId)?.abort(); }
  dispose(): void { this.disposed = true; for (const controller of this.running.values()) controller.abort(); }
}
