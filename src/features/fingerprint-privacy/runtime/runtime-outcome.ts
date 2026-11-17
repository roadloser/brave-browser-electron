import type { ExecutionContextKind } from '../../../shared/contracts/fingerprint-privacy';

export type RuntimeOutcome = {
  identity: string; context: ExecutionContextKind; applied: boolean; reason: string; coveredApis?: string[];
  failures?: string[]; firstRead?: 'prepared' | 'unknown' | 'failed';
};
export type RuntimeOutcomeUpdate =
  | { type: 'record'; outcome: RuntimeOutcome }
  | { type: 'remove'; identity: string }
  | { type: 'remove-session'; sessionId?: string }
  | { type: 'invalidate'; reason: string };
