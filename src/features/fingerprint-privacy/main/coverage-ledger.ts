import type { ExecutionContextKind } from '../../../shared/contracts/fingerprint-privacy';
import type { RuntimeOutcome, RuntimeOutcomeUpdate } from '../runtime/runtime-outcome';

export class CoverageLedger {
  private readonly entries = new Map<string, RuntimeOutcome>();

  update(update: RuntimeOutcomeUpdate): void {
    if (update.type === 'record') this.entries.set(update.outcome.identity, update.outcome);
    else if (update.type === 'remove') this.entries.delete(update.identity);
    else if (update.type === 'remove-session') {
      const prefix = `${update.sessionId ?? 'root'}:`;
      for (const identity of this.entries.keys()) if (identity.startsWith(prefix)) this.entries.delete(identity);
    } else {
      for (const [identity, outcome] of this.entries) this.entries.set(identity, {
        ...outcome, applied: false, coveredApis: [], firstRead: 'failed', reason: update.reason,
        failures: [...(outcome.failures ?? []), update.reason],
      });
    }
  }

  aggregate(): Map<ExecutionContextKind, RuntimeOutcome> {
    const groups = new Map<ExecutionContextKind, RuntimeOutcome[]>();
    for (const outcome of this.entries.values()) groups.set(outcome.context, [...(groups.get(outcome.context) ?? []), outcome]);
    const result = new Map<ExecutionContextKind, RuntimeOutcome>();
    for (const [context, outcomes] of groups) {
      const successful = outcomes.filter(outcome => outcome.applied).length;
      const failures = outcomes.flatMap(outcome => outcome.failures?.length ? outcome.failures : outcome.applied ? [] : [outcome.reason]);
      const reasons = [...new Set(outcomes.map(outcome => outcome.reason))];
      result.set(context, {
        identity: `aggregate:${context}`, context, applied: outcomes.every(outcome => outcome.applied),
        coveredApis: [...new Set(outcomes.flatMap(outcome => outcome.coveredApis ?? []))],
        failures, firstRead: outcomes.every(outcome => outcome.firstRead === 'prepared') ? 'prepared'
          : outcomes.some(outcome => outcome.firstRead === 'failed') ? 'failed' : 'unknown',
        reason: `${outcomes.length}个上下文中${successful}个已登记局部安装；${reasons.join('；')}`,
      });
    }
    return result;
  }
}
