import type { VpnRegion, VpnSystemStatus } from '../../../shared/contracts/vpn';
import type { VpnEndpointCredential } from './provider-port';

export type VpnConfiguration = VpnEndpointCredential & {
  id: string; tunnelId: string; profileId: string; payloadIdentifier: string; serviceName: string;
  region: VpnRegion; createdAt: number;
};
export type VpnTunnelSnapshot = { status: VpnSystemStatus; serviceId: string | null };
export interface VpnTunnelPort {
  readonly supported: boolean;
  inspect(configuration: VpnConfiguration): Promise<VpnTunnelSnapshot>;
  connect(configuration: VpnConfiguration, signal: AbortSignal, changed: (status: VpnTunnelSnapshot) => void): Promise<VpnTunnelSnapshot>;
  disconnect(configuration: VpnConfiguration, signal?: AbortSignal): Promise<VpnTunnelSnapshot>;
  dispose(): Promise<void>;
}
