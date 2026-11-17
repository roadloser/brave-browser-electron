import type { RewardsProviderName } from '../../../../shared/contracts/rewards';
import type { RewardsFetch } from '../rewards-network';

export type OAuthSession = { provider: RewardsProviderName; state: string; verifier: string; startedAt: number };
export type ProviderToken = { token: string; address?: string; linkingInfo?: string; displayName?: string };
export type ExternalAccount = {
  provider: RewardsProviderName; status: 'authorizing' | 'preparing' | 'claiming' | 'connected' | 'unknown' | 'failed' | 'signed-out';
  tokenCipher?: string; address?: string; linkingCipher?: string; displayName?: string; country?: string;
  balance?: string; balanceAt?: number; error?: string; updatedAt: number;
};
export type ProviderOperation = { fetch: RewardsFetch; signal: AbortSignal; serviceKey?: string };
