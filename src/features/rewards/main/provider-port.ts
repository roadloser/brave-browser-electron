export type RewardsProviderConfiguration = { grantEndpoint: string; serviceKey?: string };
export type RewardsWalletStatus = {
  provider: { name: string; id: string; linkingId: string } | null;
  linked: boolean;
  selfCustodyAvailable: Record<string, boolean>;
};
export interface RewardsSignerPort {
  publicKeyHex(recoverySeed: Uint8Array): string;
  headers(recoverySeed: Uint8Array, keyId: string, method: string, path: string, content: string): Record<string, string>;
}
export interface RewardsProviderPort {
  readonly id: string;
  register(configuration: RewardsProviderConfiguration, seed: Uint8Array, country: string, signal: AbortSignal): Promise<{ paymentId: string }>;
  wallet(configuration: RewardsProviderConfiguration, seed: Uint8Array, paymentId: string, signal: AbortSignal): Promise<RewardsWalletStatus>;
}
