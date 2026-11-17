import type { PrivacyMode } from '../../../shared/contracts/fingerprint-privacy';

export const PRIVACY_RUNTIME_CHANNEL = 'brave:privacy:frame-policy';
export type FramePrivacyPolicy = { mode: PrivacyMode; token: { high: string; low: string } | null; scope: string | null };
export interface PrivacyRuntimePort {
  install(policy: FramePrivacyPolicy): { installed: boolean; coveredApis: string[] };
}
