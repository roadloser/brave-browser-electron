import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { VpnRegion } from '../../../shared/contracts/vpn';

export type VpnCredentialInput = { kind: 'brave-premium' | 'subscriber'; value: string };
export type VpnEndpointCredential = {
  hostname: string; username: string; password: string;
  clientId?: string; apiAuthToken?: string;
};
export interface VpnProviderPort {
  authorize(context: BrowserContext, input: VpnCredentialInput, signal: AbortSignal): Promise<string>;
  regions(context: BrowserContext, signal: AbortSignal): Promise<VpnRegion[]>;
  credentials(context: BrowserContext, subscriber: string, region: VpnRegion, signal: AbortSignal): Promise<VpnEndpointCredential>;
}
