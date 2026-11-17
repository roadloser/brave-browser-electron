import { z } from 'zod';

export type VpnRegion = { id: string; name: string; country: string; precision: 'country' | 'city'; parentId?: string };
export type VpnSystemStatus = 'not-installed' | 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'invalid' | 'unknown';
export type VpnState = {
  phase: 'unconfigured' | 'ready' | 'authorizing' | 'preparing' | 'awaiting-install' | 'connecting' | 'connected' | 'disconnecting' | 'failed';
  summary: string; hasCredential: boolean; credentialValidated: boolean; regions: VpnRegion[];
  region: VpnRegion | null; hostname: string | null; configurationId: string | null;
  systemStatus: VpnSystemStatus; serviceId: string | null; canRollback: boolean;
  installationPending: boolean; secretStorageAvailable: boolean; error?: string; revision: number;
  capabilities: { supported: boolean; protocol: 'ikev2'; scope: 'system'; installation: 'system-confirmation'; routeDns: 'unobserved'; killSwitch: 'unobserved'; wireguard: false; multihop: false; smartRouting: false };
};
export const vpnCommandSchemas = {
  'vpn.get': z.object({}),
  'vpn.refresh': z.object({}),
  'vpn.loadRegions': z.object({}),
  'vpn.setCredential': z.object({ kind: z.enum(['brave-premium', 'subscriber']), value: z.string().trim().min(1).max(65536) }),
  'vpn.prepare': z.object({ regionId: z.string().min(1).max(200) }),
  'vpn.install': z.object({ confirmed: z.literal(true) }),
  'vpn.connect': z.object({}),
  'vpn.disconnect': z.object({}),
  'vpn.cancel': z.object({}),
  'vpn.rollback': z.object({ confirmed: z.literal(true) }),
  'vpn.forgetCredential': z.object({ confirmed: z.literal(true) }),
  'vpn.openAccount': z.object({}),
};
export interface VpnCommandResults {
  'vpn.get': VpnState; 'vpn.refresh': VpnState; 'vpn.loadRegions': VpnState;
  'vpn.setCredential': VpnState; 'vpn.prepare': VpnState; 'vpn.install': VpnState;
  'vpn.connect': VpnState; 'vpn.disconnect': VpnState; 'vpn.cancel': VpnState;
  'vpn.rollback': VpnState; 'vpn.forgetCredential': VpnState; 'vpn.openAccount': void;
}
