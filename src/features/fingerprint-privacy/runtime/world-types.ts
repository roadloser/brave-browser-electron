import type { PrivacyMode } from '../../../shared/contracts/fingerprint-privacy';
export type WorldPrivacyPolicy = {
  mode: PrivacyMode; token: { high: string; low: string } | null; scope: string | null;
  hardwareConcurrency?: number;
  webglBalanced?: boolean;
  screenFingerprinting?: boolean;
};
export type WorldInstallResult = {
  installed: boolean; coveredApis: string[]; failures: string[]; algorithmRevision: string;
};
