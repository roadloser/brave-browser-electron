import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import { BrowserError } from '../../../../shared/errors';
import type { AdsTokenCryptoPort } from './crypto-port';
import type { AdsConfirmationProviderPort } from './confirmation-provider';
import type { AdEventType, AdPlacement, ConfirmationMaterial, PendingConfirmation } from './delivery-types';
import { AdsDeliveryRepository } from './delivery-repository';
import { confirmationPayload, paddedBase64Url } from './confirmation-payload';
import { contextAdsFetch } from './ads-fetch';

export class AdsConfirmationService {
  private readonly running = new Map<string, AbortController>();
  private disposed = false;
  constructor(private readonly runtime: FeatureRuntime, private readonly crypto: AdsTokenCryptoPort,
    private readonly provider: AdsConfirmationProviderPort, private readonly notify: (profileId: string) => void) {}

  busy(profileId: string): boolean { return this.running.has(profileId); }
  async record(context: BrowserContext, placement: AdPlacement, type: AdEventType): Promise<void> {
    const repository = this.repository(context.profileId);
    if (repository.confirmation(placement.id, type)) return;
    await this.crypto.initialize();
    if (this.disposed) return;
    if (repository.confirmation(placement.id, type)) return;
    const confirmation = repository.reserve(repository.issuers()?.confirmations ?? [], token => {
      const id = randomUUID(); const paymentBatch = this.crypto.create(1);
      const payload = confirmationPayload(placement, type, id, paymentBatch.blindedTokens[0], token.publicKey);
      const signed = this.crypto.credential(this.runtime.secrets.decrypt(token.tokenCipher), payload);
      const credential = paddedBase64Url(JSON.stringify({ signature: signed.signature, t: signed.tokenPreimage }));
      const material: ConfirmationMaterial = { paymentBatch, payload, credential };
      return { id, placementId: placement.id, type, createdAt: Date.now(), materialCipher: this.runtime.secrets.encrypt(JSON.stringify(material)), status: 'prepared', attempts: 0, retryAt: 0 };
    });
    if (!confirmation) throw new BrowserError('UNAVAILABLE', '没有可用确认token；真实广告事件已保留，未伪造确认');
    this.notify(context.profileId);
    await this.resume(context);
  }

  async resume(context: BrowserContext, force = false): Promise<void> {
    if (this.running.has(context.profileId)) return;
    const repository = this.repository(context.profileId); const issuers = repository.issuers();
    if (!issuers || issuers.expiresAt <= Date.now()) return;
    const controller = new AbortController(); this.running.set(context.profileId, controller);
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      await this.crypto.initialize();
      for (const confirmation of repository.confirmations().filter(item => item.status !== 'complete' && (force || item.retryAt <= Date.now()))) {
        if (controller.signal.aborted || this.disposed) break;
        try { await this.process(context, confirmation, controller.signal); }
        catch (error) {
          if (this.disposed) return;
          const message = error instanceof Error ? error.message : '广告匿名确认失败';
          const retryAt = error instanceof BrowserError && !error.recoverable && !controller.signal.aborted ? Number.MAX_SAFE_INTEGER : Date.now() + 60_000 * Math.min(60, 2 ** Math.min(confirmation.attempts, 6));
          repository.saveConfirmation({ ...repository.confirmations().find(item => item.id === confirmation.id)!, status: 'failed', retryAt, error: controller.signal.aborted ? '匿名确认已暂停，保留相同交易和token恢复' : message });
          if (error instanceof BrowserError && error.code === 'FORBIDDEN') break;
        }
      }
    } finally { clearTimeout(timeout); this.running.delete(context.profileId); if (!this.disposed) this.notify(context.profileId); }
  }
  cancel(profileId: string): void { this.running.get(profileId)?.abort(); }
  dispose(): void { this.disposed = true; for (const controller of this.running.values()) controller.abort(); }
  private async process(context: BrowserContext, confirmation: PendingConfirmation, signal: AbortSignal): Promise<void> {
    const repository = this.repository(context.profileId); const fetch = contextAdsFetch(this.runtime, context);
    const material = JSON.parse(this.runtime.secrets.decrypt(confirmation.materialCipher)) as ConfirmationMaterial;
    const next = { ...confirmation, attempts: confirmation.attempts + 1, error: undefined };
    repository.saveConfirmation({ ...next, status: 'posting' });
    await this.provider.confirm(confirmation.id, material.credential, material.payload, fetch, signal);
    repository.saveConfirmation({ ...next, status: 'fetching' });
    await delay(3000, undefined, { signal });
    const payment = await this.provider.payment(confirmation.id, fetch, signal);
    const value = repository.issuers()?.payments[payment.publicKey];
    if (value === undefined) throw new BrowserError('FORBIDDEN', '广告paymentToken不属于独立可信issuer');
    let tokens: string[];
    try { tokens = this.crypto.verifyAndUnblind(material.paymentBatch, payment); }
    catch { throw new BrowserError('FORBIDDEN', '广告paymentToken批证明不匹配，未保存奖励凭证', false); }
    if (signal.aborted) throw new BrowserError('CANCELLED', '广告确认暂停');
    repository.payment(next, { id: confirmation.id, tokenCipher: this.runtime.secrets.encrypt(tokens[0]), publicKey: payment.publicKey, type: confirmation.type, value, redeemed: false });
  }
  private repository(profileId: string) { return new AdsDeliveryRepository(this.runtime.storage.open(profileId)); }
}
