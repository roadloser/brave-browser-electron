import { app } from 'electron';
import type { AdEventType, AdPlacement } from './delivery-types';

function privateTime(timestamp: number): string {
  const date = new Date(timestamp); date.setUTCMinutes(0, 0, 0); return date.toISOString();
}
export function confirmationPayload(placement: AdPlacement, type: AdEventType, transactionId: string, blindedPaymentToken: string, publicKey: string): string {
  const version = app.getVersion().split('.');
  return JSON.stringify({
    blindedPaymentTokens: [blindedPaymentToken], catalog: [{ id: placement.catalogId }], countryCode: placement.country,
    createdAtTimestamp: privateTime(placement.events?.[type] ?? placement.createdAt), creativeInstanceId: placement.creative.id,
    platform: 'macos', publicKey, segment: 'untargeted', systemTimestamp: privateTime(Date.now()),
    transactionId, type, versionNumber: `${version[0] ?? '0'}.${version[1] ?? '0'}.0.0`,
  });
}
export function paddedBase64Url(text: string): string { return Buffer.from(text).toString('base64').replaceAll('+', '-').replaceAll('/', '_'); }
