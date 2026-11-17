import type { ExecutionContextKind } from '../../../shared/contracts/fingerprint-privacy';
import { BrowserError } from '../../../shared/errors';
import type { PrivacyStorageScope } from './storage-key';

export type PrivacyPolicyScope = PrivacyStorageScope & { policyOrigin: string };

export function resolvePolicyScope(scope: PrivacyStorageScope, kind: ExecutionContextKind,
  topFrameOrigin: string, mainThreadWorklet = false): PrivacyPolicyScope {
  const inheritsTop = kind === 'window' || kind === 'iframe' || kind === 'dedicated-worker' || kind === 'worklet';
  const policyOrigin = inheritsTop ? topFrameOrigin : scope.origin;
  if (!policyOrigin || !/^https?:\/\//.test(policyOrigin)) throw new BrowserError('UNAVAILABLE', '未取得Brave策略要求的真实顶层来源，不以子框架或模块URL代替');
  const nonce = kind === 'window' || kind === 'iframe' || (kind === 'worklet' && mainThreadWorklet) ? scope.nonce : null;
  return { ...scope, policyOrigin, nonce };
}
