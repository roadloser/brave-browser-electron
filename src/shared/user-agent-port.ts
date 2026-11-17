import type { DebuggerLease } from './runtime-ports';

export type UserAgentBrand = 'Brave' | 'Google Chrome';
export type UserAgentPolicy = { brand: UserAgentBrand };
export interface UserAgentPort {
  apply(lease: DebuggerLease, policy: UserAgentPolicy, sessionId?: string): Promise<void>;
  clear(lease: DebuggerLease, sessionId?: string): Promise<void>;
}
