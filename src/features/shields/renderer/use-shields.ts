import { useEffect, useRef, useState } from 'react';
import type { ShieldsState, ShieldRuleState } from '../../../shared/contracts/shields';
import { browserClient } from '../../../renderer/client/browser-client';

export function useShields(tabId?: string) {
  const [state, setState] = useState<ShieldsState | null>(null);
  const [rules, setRules] = useState<ShieldRuleState | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; setState(null);
    const releaseState = browserClient.on('shields.changed', next => {
      if (next.tabId === tabId) setState(previous => !previous || next.revision >= previous.revision ? next : previous);
    });
    const releaseRules = browserClient.on('shields.rulesChanged', setRules);
    if (tabId) void browserClient.command('shields.get', { tabId }).then(next => { if (mounted.current) setState(next); }).catch(problem => { if (mounted.current) setError(problem instanceof Error ? problem.message : 'Shields读取失败'); });
    void browserClient.command('shields.rules', {}).then(next => { if (mounted.current) setRules(next); }).catch(() => undefined);
    return () => { mounted.current = false; releaseState(); releaseRules(); };
  }, [tabId]);

  async function run(operation: () => Promise<unknown>) {
    setPending(true); setError('');
    try { await operation(); }
    catch (problem) { if (mounted.current) setError(problem instanceof Error ? problem.message : 'Shields操作失败'); }
    finally { if (mounted.current) setPending(false); }
  }
  return { state, rules, error, pending, run };
}
