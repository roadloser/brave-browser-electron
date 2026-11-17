import { z } from 'zod';

export type VpnAccountState = {
  phase: 'signed-out' | 'opening' | 'waiting' | 'authorizing' | 'authorized' | 'expired' | 'cancelled' | 'failed';
  summary: string; expiresAt: number | null; loginOpen: boolean; error?: string; revision: number;
};
export const vpnAccountCommandSchemas = {
  'vpn.account.get': z.object({}),
  'vpn.account.login': z.object({}),
  'vpn.account.refresh': z.object({}),
  'vpn.account.cancel': z.object({}),
  'vpn.account.signOut': z.object({ confirmed: z.literal(true) }),
};
export interface VpnAccountCommandResults {
  'vpn.account.get': VpnAccountState; 'vpn.account.login': VpnAccountState;
  'vpn.account.refresh': VpnAccountState; 'vpn.account.cancel': VpnAccountState;
  'vpn.account.signOut': VpnAccountState;
}
