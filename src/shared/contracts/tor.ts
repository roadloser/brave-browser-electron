import { z } from 'zod';

export type TorState = {
  phase: 'unconfigured' | 'stopped' | 'starting' | 'bootstrapping' | 'connected' | 'stopping' | 'failed';
  bootstrapProgress: number; summary: string; version: string | null;
  componentHash: string | null; canRollback: boolean; contextId: string | null;
  error?: string; revision: number;
  capabilities: { isolation: 'context'; siteCircuits: false; dns: 'proxy-resolution-unobserved' | 'observed'; webRtc: 'non-proxied-udp-disabled-unobserved' | 'observed' };
};
export const torCommandSchemas = {
  'tor.get': z.object({}),
  'tor.chooseComponent': z.object({}),
  'tor.start': z.object({}),
  'tor.cancel': z.object({}),
  'tor.newIdentity': z.object({ confirmed: z.literal(true) }),
  'tor.stop': z.object({}),
  'tor.rollbackComponent': z.object({}),
};
export interface TorCommandResults {
  'tor.get': TorState;
  'tor.chooseComponent': TorState;
  'tor.start': TorState;
  'tor.cancel': TorState;
  'tor.newIdentity': TorState;
  'tor.stop': TorState;
  'tor.rollbackComponent': TorState;
}
