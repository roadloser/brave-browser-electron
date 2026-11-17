import { z } from 'zod';

export type RewardsState = {
  status: 'unconfigured' | 'ready' | 'registering' | 'registered' | 'refreshing' | 'cancelled' | 'failed' | 'needs-authorization';
  endpoint: string; hasServiceKey: boolean; country: string | null;
  solanaRpcUrl?: string;
  paymentId: string | null; balance: { amount: string | null; currency: 'BAT'; status: 'unknown' | 'pending' | 'confirmed'; updatedAt: number | null };
  provider: string | null; linked: boolean | null; selfCustodyAvailable: boolean | null;
  account: { status: 'unconnected' | 'pending' | 'connected' | 'rejected'; provider?: string; message?: string };
  ads: {
    status: 'unconfigured' | 'eligible' | 'ineligible' | 'unknown'; reason?: string;
    tokenStatus?: 'empty' | 'requesting' | 'awaiting-signature' | 'ready' | 'failed';
    tokenCount?: number; error?: string;
  };
  settlement: { status: 'unknown' | 'pending' | 'confirmed' | 'failed'; amount?: string; updatedAt?: number };
  adsDelivery?: {
    enabled: boolean; maxPerHour: number; catalogStatus: 'empty' | 'refreshing' | 'ready' | 'failed';
    catalogId?: string; creativeCount: number; lastUpdatedAt: number | null;
    pendingConfirmations: number; paymentTokenCount: number;
    confirmationStatus: 'idle' | 'running' | 'failed'; settlementStatus: 'idle' | 'running' | 'confirmed' | 'unknown' | 'failed';
    reason?: string; error?: string;
  };
  capabilities: { operation: string; status: 'implemented' | 'blocked' | 'unknown'; reason?: string }[];
  lastRequestId: string | null; error?: string; revision: number;
};
export const rewardsCommandSchemas = {
  'rewards.get': z.object({}),
  'rewards.configure': z.object({ endpoint: z.string().url().max(2048), serviceKey: z.string().max(16384).optional(), solanaRpcUrl: z.string().url().max(2048).optional() }),
  'rewards.register': z.object({ geoCountry: z.string().regex(/^[A-Z]{2}$/), confirmed: z.literal(true) }),
  'rewards.refresh': z.object({}),
  'rewards.cancel': z.object({}),
  'rewards.connectSelfCustody': z.object({ confirmed: z.literal(true) }),
  'rewards.configureAds': z.object({
    nonAnonymousEndpoint: z.string().url().max(2048),
    issuerPublicKeys: z.array(z.string().min(16).max(4096)).min(1).max(128),
  }),
  'rewards.refillConfirmationTokens': z.object({ confirmed: z.literal(true) }),
  'rewards.configureAdsDelivery': z.object({ enabled: z.boolean(), maxPerHour: z.number().int().min(1).max(10), confirmed: z.literal(true) }),
  'rewards.refreshAds': z.object({}),
  'rewards.retryAdsConfirmations': z.object({}),
  'rewards.redeemPaymentTokens': z.object({ confirmed: z.literal(true) }),
};
export interface RewardsCommandResults {
  'rewards.get': RewardsState;
  'rewards.configure': RewardsState;
  'rewards.register': RewardsState;
  'rewards.refresh': RewardsState;
  'rewards.cancel': RewardsState;
  'rewards.connectSelfCustody': RewardsState;
  'rewards.configureAds': RewardsState;
  'rewards.refillConfirmationTokens': RewardsState;
  'rewards.configureAdsDelivery': RewardsState;
  'rewards.refreshAds': RewardsState;
  'rewards.retryAdsConfirmations': RewardsState;
  'rewards.redeemPaymentTokens': RewardsState;
}
