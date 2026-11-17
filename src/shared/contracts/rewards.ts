import { z } from 'zod';

export type RewardsState = {
  status: 'unconfigured' | 'ready' | 'registering' | 'registered' | 'refreshing' | 'cancelled' | 'failed' | 'needs-authorization';
  endpoint: string; hasServiceKey: boolean; country: string | null;
  solanaRpcUrl?: string;
  paymentId: string | null; balance: { amount: string | null; currency: 'BAT'; status: 'unknown' | 'pending' | 'confirmed'; updatedAt: number | null };
  provider: string | null; linked: boolean | null; selfCustodyAvailable: boolean | null;
  account: { status: 'unconnected' | 'pending' | 'connected' | 'rejected'; provider?: string; message?: string };
  ads: { status: 'unconfigured' | 'eligible' | 'ineligible' | 'unknown'; reason?: string };
  settlement: { status: 'unknown' | 'pending' | 'confirmed' | 'failed'; amount?: string; updatedAt?: number };
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
};
export interface RewardsCommandResults {
  'rewards.get': RewardsState;
  'rewards.configure': RewardsState;
  'rewards.register': RewardsState;
  'rewards.refresh': RewardsState;
  'rewards.cancel': RewardsState;
  'rewards.connectSelfCustody': RewardsState;
}
