import type { FingerprintApi, PrivacyCapability, RuntimeCoverage, ExecutionContextKind } from '../../../shared/contracts/fingerprint-privacy';

export type RuntimeOutcome = {
  context: ExecutionContextKind; applied: boolean; reason: string; coveredApis?: string[];
  failures?: string[]; firstRead?: 'prepared' | 'unknown' | 'failed';
};
const prefixes: Record<FingerprintApi, string[]> = {
  audio: ['AudioBuffer.', 'AnalyserNode.'], canvas: ['Canvas.'], navigator: ['navigator.'],
  webgl: ['WebGL'], fonts: ['Font'], screen: ['Screen.', 'Window.'],
};
export function capabilityWithOutcome(capability: PrivacyCapability, outcome?: RuntimeOutcome): PrivacyCapability {
  if (!outcome || capability.status === 'not-applicable') return capability;
  const implemented = outcome.coveredApis?.some(name => prefixes[capability.api].some(prefix => name.startsWith(prefix))) ?? false;
  return { ...capability, implemented, observed: false, status: implemented ? 'partial' : 'blocked',
    reason: implemented ? outcome.reason : `${capability.reason}；当前上下文未登记该API安装` };
}
export function coverageFromOutcomes(outcomes: Map<ExecutionContextKind, RuntimeOutcome> | undefined): RuntimeCoverage[] {
  return [...(outcomes?.values() ?? [])].map(outcome => ({
    context: outcome.context, installed: outcome.applied,
    firstRead: outcome.firstRead === 'prepared' ? 'guarded' : outcome.firstRead === 'failed' ? 'unknown' : 'racy',
    reason: outcome.reason, failures: outcome.failures?.length ?? (outcome.applied ? 0 : 1),
  }));
}
