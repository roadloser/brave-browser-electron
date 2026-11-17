import { BrowserError } from '../../../../shared/errors';
import type { SkuCryptoAdapter } from './crypto-adapter';
import type { SkuRepository } from './repository';
import type { SkuPresentation, SkuRecord, SkuSummary } from './types';

const utcDate = (value: string): number => Date.parse(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value.length === 10 ? `${value}T00:00:00` : value}Z`);
const naiveDate = (value: string): string => new Date(utcDate(value)).toISOString().replace(/\.000Z$/, '');

export class SkuCredentialPresenter {
  constructor(private readonly repository: SkuRepository, private readonly crypto: SkuCryptoAdapter) {}
  summary(profileId: string): SkuSummary | null {
    for (const record of this.records(profileId)) {
      const item = record.order.items[0];
      const state = record.items[item.id];
      const now = Date.now();
      if (!state) return { order: record.order, remaining_credential_count: 0, expires_at: record.order.expires_at, active: false, next_active_at: null };
      if (item.credential_type === 'time-limited') {
        const credential = state.timeLimited.find(value => utcDate(value.issuedAt) < now && now < utcDate(value.expiresAt));
        if (credential) return { order: record.order, remaining_credential_count: 1, expires_at: naiveDate(credential.expiresAt), active: true, next_active_at: null };
      } else {
        const bucket = state.buckets.find(value => utcDate(value.validFrom) < now && now < utcDate(value.validTo));
        const remaining = bucket?.tokens.filter(token => !token.spent).length ?? 0;
        const next = state.buckets.filter(value => utcDate(value.validFrom) > now && value.tokens.some(token => !token.spent)).sort((left, right) => utcDate(left.validFrom) - utcDate(right.validFrom))[0];
        return { order: record.order, remaining_credential_count: remaining, expires_at: state.buckets.at(-1)?.validTo ?? record.order.expires_at, active: remaining > 0, next_active_at: next ? naiveDate(next.validFrom) : null };
      }
    }
    return null;
  }
  present(profileId: string, path: string): SkuPresentation {
    if (path !== '*' && path !== '/') throw new BrowserError('FORBIDDEN', '账户授权路径不受支持');
    return this.repository.update(profileId, document => {
      const records = Object.values(document.orders).sort((left, right) => utcDate(right.order.expires_at ?? '1970-01-01') - utcDate(left.order.expires_at ?? '1970-01-01'));
      for (const record of records) {
        const item = record.order.items[0];
        const state = record.items[item.id];
        if (!state) continue;
        let inner: unknown;
        let expiresAt: number;
        if (item.credential_type === 'time-limited') {
          const credential = state.timeLimited.find(value => utcDate(value.issuedAt) < Date.now() && Date.now() < utcDate(value.expiresAt));
          if (!credential) continue;
          inner = { issuedAt: credential.issuedAt, expiresAt: credential.expiresAt, token: credential.token };
          expiresAt = utcDate(credential.expiresAt);
        } else {
          const bucket = state.buckets.find(value => utcDate(value.validFrom) < Date.now() && Date.now() < utcDate(value.validTo));
          const token = bucket?.tokens.find(value => !value.spent);
          if (!bucket || !token) continue;
          const issuer = `${record.order.merchant_id}?sku=${item.sku}`;
          if (/[\r\n\s]/.test(issuer)) throw new BrowserError('UNAVAILABLE', '账户发行标识格式不受支持');
          const signed = this.crypto.sign(token.encoded, issuer, token.rfc);
          inner = { validFrom: naiveDate(bucket.validFrom), validTo: naiveDate(bucket.validTo), issuer, t: signed.preimage, signature: signed.signature };
          expiresAt = utcDate(bucket.validTo);
          token.spent = true;
        }
        const presentation = Buffer.from(JSON.stringify(inner)).toString('base64');
        const credential = Buffer.from(JSON.stringify({ type: item.credential_type, version: item.credential_type === 'time-limited-v2' ? 2 : 1, sku: item.sku, presentation })).toString('base64');
        const cookie = `__Secure-sku#${item.sku}=${encodeURIComponent(credential)};path=${path};samesite=strict;expires=${new Date(expiresAt).toUTCString()};secure`;
        return { cookie, credential, expiresAt };
      }
      throw new BrowserError('FORBIDDEN', '没有当前可用VPN授权，请在官方账户页激活或重新登录');
    });
  }
  private records(profileId: string): SkuRecord[] {
    return Object.values(this.repository.load(profileId).orders).sort((left, right) => utcDate(right.order.expires_at ?? '1970-01-01') - utcDate(left.order.expires_at ?? '1970-01-01'));
  }
}
