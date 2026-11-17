import { z } from 'zod';
import { idSchema } from './browser-core';
import { originSchema } from './site-settings';

export const privacyModeSchema = z.enum(['off', 'balanced', 'maximum']);
export type PrivacyMode = z.infer<typeof privacyModeSchema>;
export type FingerprintApi = 'navigator' | 'canvas' | 'audio' | 'webgl' | 'fonts' | 'screen';
export type ExecutionContextKind = 'window' | 'iframe' | 'dedicated-worker' | 'shared-worker' | 'service-worker' | 'worklet';
export type PrivacyCapability = {
  api: FingerprintApi; context: ExecutionContextKind;
  status: 'unknown' | 'partial' | 'blocked' | 'verified' | 'not-applicable';
  implemented: boolean; observed: boolean; reason: string; evidenceId?: string;
};
export type RuntimeCoverage = {
  context: ExecutionContextKind; installed: boolean; firstRead: 'guarded' | 'racy' | 'unknown';
  reason?: string; failures: number;
};
export type PrivacyState = {
  mode: PrivacyMode; defaultMode: PrivacyMode; site: string | null; inherited: boolean;
  runtimeVersion: string; capabilities: PrivacyCapability[];
  scope: { profileId: string; contextId: string; site: string | null; generation: number } | null;
  revision: number;
  coverage?: RuntimeCoverage[];
};
export const privacyCommandSchemas = {
  'privacy.get': z.object({ tabId: idSchema.optional() }),
  'privacy.setDefault': z.object({ mode: privacyModeSchema }),
  'privacy.setSite': z.object({ origin: originSchema, mode: privacyModeSchema.nullable() }),
  'privacy.resetSite': z.object({ origin: originSchema }),
};
export interface PrivacyCommandResults {
  'privacy.get': PrivacyState;
  'privacy.setDefault': PrivacyState;
  'privacy.setSite': PrivacyState;
  'privacy.resetSite': PrivacyState;
}
