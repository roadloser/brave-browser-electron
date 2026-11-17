import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import { BrowserError } from '../../../../shared/errors';
import type { SkuHttpClient } from './http-client';
import type { SkuRepository } from './repository';
import type { SkuCryptoAdapter } from './crypto-adapter';
import type { SkuBucket, SkuItem, SkuOrder, SkuPending } from './types';
import { mayIssueCredentials } from './order-parser';

const encoded = z.string().min(1).max(4096);
const signedBucketSchema = z.object({ itemId: z.string().uuid(), orderId: z.string().uuid(), blindedCreds: z.array(encoded).min(1).max(5000), signedCreds: z.array(encoded).min(1).max(5000), batchProof: encoded, publicKey: encoded, issuerId: z.string().min(1).max(512), validFrom: z.string(), validTo: z.string() });
const timeCredentialSchema = z.object({ id: z.string().uuid(), orderId: z.string().uuid(), issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), token: z.string().min(1).max(65536) });

export class SkuCredentialFetcher {
  constructor(private readonly http: SkuHttpClient, private readonly repository: SkuRepository, private readonly crypto: SkuCryptoAdapter) {}
  async fetch(context: BrowserContext, order: SkuOrder, signal: AbortSignal): Promise<void> {
    if (!mayIssueCredentials(order)) throw new BrowserError('FORBIDDEN', '此VPN订单尚未支付或已失效');
    await this.crypto.initialize();
    for (const item of order.items) {
      signal.throwIfAborted();
      if (item.credential_type === 'single-use') throw new BrowserError('UNAVAILABLE', '此VPN订单未提供带有效期的授权类型');
      const stored = this.repository.load(context.profileId).orders[order.id]?.items[item.id];
      if (item.credential_type === 'time-limited-v2' && stored?.buckets.some(bucket => Date.parse(bucket.validTo) > Date.now() + 5 * 86400000) && !stored.pending) continue;
      const pending = item.credential_type === 'time-limited-v2' ? this.pending(context.profileId, order, item) : { requestId: randomUUID(), tokens: [], blinded: [], submitted: false };
      let requestId = pending.requestId;
      if (item.credential_type === 'time-limited-v2' && !pending.submitted) {
        try { await this.http.request(context, 'PUT', this.path(order.id, item.id, requestId), signal, { blindedCreds: pending.blinded }); }
        catch (error) {
          if (!(error instanceof BrowserError) || error.code !== 'CONFLICT') throw error;
          requestId = randomUUID();
          this.repository.update(context.profileId, document => { document.orders[order.id].items[item.id].pending!.requestId = requestId; });
          await this.http.request(context, 'PUT', this.path(order.id, item.id, requestId), signal, { blindedCreds: pending.blinded });
        }
        this.repository.update(context.profileId, document => { document.orders[order.id].items[item.id].pending!.submitted = true; });
      }
      const response = await this.http.request(context, 'GET', this.path(order.id, item.id, requestId), signal);
      signal.throwIfAborted();
      if (item.credential_type === 'time-limited') this.storeTimeLimited(context.profileId, order.id, item.id, response);
      else this.storeBuckets(context.profileId, order.id, item.id, pending, response);
    }
  }
  private pending(profileId: string, order: SkuOrder, item: SkuItem): SkuPending {
    const existing = this.repository.load(profileId).orders[order.id].items[item.id]?.pending;
    if (existing) return existing;
    const count = (order.metadata?.num_intervals ?? 0) * (order.metadata?.num_per_interval ?? 0);
    const pending = { requestId: randomUUID(), ...this.crypto.create(count), submitted: false };
    this.repository.update(profileId, document => {
      const state = document.orders[order.id].items[item.id] ?? { buckets: [], timeLimited: [] };
      state.pending = pending;
      document.orders[order.id].items[item.id] = state;
    });
    return pending;
  }
  private storeBuckets(profileId: string, orderId: string, itemId: string, pending: SkuPending, raw: unknown): void {
    const parsed = z.array(signedBucketSchema).min(1).max(5000).safeParse(raw);
    if (!parsed.success) throw new BrowserError('UNAVAILABLE', '账户签发的授权批次格式变化');
    const buckets: SkuBucket[] = parsed.data.map(bucket => {
      if (bucket.orderId !== orderId || bucket.itemId !== itemId || !Number.isFinite(Date.parse(bucket.validFrom)) || !Number.isFinite(Date.parse(bucket.validTo)) || Date.parse(bucket.validTo) <= Date.parse(bucket.validFrom)) throw new BrowserError('UNAVAILABLE', '账户授权批次归属或有效期无效');
      return { validFrom: bucket.validFrom, validTo: bucket.validTo, issuerId: bucket.issuerId, tokens: this.crypto.unblind(pending, bucket).map(value => ({ encoded: value, spent: false, rfc: true })) };
    });
    this.repository.update(profileId, document => {
      const state = document.orders[orderId].items[itemId];
      for (const bucket of buckets) if (!state.buckets.some(existing => existing.validFrom === bucket.validFrom && existing.validTo === bucket.validTo)) state.buckets.push(bucket);
      state.buckets = state.buckets.filter(bucket => Date.parse(bucket.validTo) > Date.now()).sort((left, right) => Date.parse(left.validFrom) - Date.parse(right.validFrom));
      state.pending = undefined;
    });
  }
  private storeTimeLimited(profileId: string, orderId: string, itemId: string, raw: unknown): void {
    const parsed = z.array(timeCredentialSchema).min(1).max(5000).safeParse(raw);
    if (!parsed.success || parsed.data.some(credential => credential.id !== itemId || credential.orderId !== orderId)) throw new BrowserError('UNAVAILABLE', '账户时间授权格式或归属无效');
    this.repository.update(profileId, document => {
      const state = document.orders[orderId].items[itemId] ?? { buckets: [], timeLimited: [] };
      state.timeLimited = parsed.data.map(credential => ({ issuedAt: credential.issuedAt, expiresAt: credential.expiresAt, token: credential.token }));
      document.orders[orderId].items[itemId] = state;
    });
  }
  private path(orderId: string, itemId: string, requestId: string): string { return `/v1/orders/${orderId}/credentials/items/${itemId}/batches/${requestId}`; }
}
