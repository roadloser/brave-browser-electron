import type { BlindedTokenBatch } from './crypto-port';

export type AdEventType = 'view' | 'click' | 'dismiss';
export type AdCreative = {
  id: string; campaignId: string; creativeSetId: string; title: string; body: string; targetUrl: string;
  startAt: number; endAt: number; priority: number; passThroughRate: number; value: string;
  countries: string[]; segments: string[]; platforms: string[];
  dayparts: { days: string; startMinute: number; endMinute: number }[];
  caps: { campaignDaily: number; daily: number; weekly: number; monthly: number; total: number };
};
export type AdsCatalog = { id: string; version: 9; fetchedAt: number; expiresAt: number; creatives: AdCreative[] };
export type AdsIssuers = { fetchedAt: number; expiresAt: number; confirmations: string[]; payments: Record<string, string> };
export type AdsDeliverySettings = { enabled: boolean; maxPerHour: number; country?: string; subdivision?: string; updatedAt?: number; nextRedemptionAt?: number; error?: string };
export type AdPlacement = { id: string; windowId: string; creative: AdCreative; catalogId: string; country: string; createdAt: number; shownAt?: number; events?: Partial<Record<AdEventType, number>> };
export type ConfirmationMaterial = { paymentBatch: BlindedTokenBatch; payload: string; credential: string };
export type PendingConfirmation = {
  id: string; placementId: string; type: AdEventType; createdAt: number; materialCipher: string;
  status: 'prepared' | 'posting' | 'fetching' | 'failed' | 'complete'; attempts: number; retryAt: number; error?: string;
};
export type PaymentToken = { id: string; tokenCipher: string; publicKey: string; type: AdEventType; value: string; redeemed: boolean };
export type RedemptionBatch = { id: string; tokenIds: string[]; bodyCipher: string; status: 'pending' | 'unknown' | 'failed' | 'confirmed'; createdAt: number; error?: string };
