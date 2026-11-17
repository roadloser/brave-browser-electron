import { useEffect, useState } from 'react';
import type { ExtensionActionsState } from '../../../shared/contracts/extensions';
import { browserClient } from '../../../renderer/client/browser-client';

export function useExtensionActions(tabId?: string) {
  const [state, setState] = useState<ExtensionActionsState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let generation = 0;
    setState(null);
    const refresh = async () => {
      if (!tabId) return;
      const request = ++generation;
      try {
        const next = await browserClient.command('extensions.actions', { tabId });
        if (active && generation === request) { setState(next); setError(''); }
      } catch (problem) {
        if (active && generation === request) setError(problem instanceof Error ? problem.message : '扩展action状态读取失败');
      }
    };
    const releaseActions = browserClient.on('extensions.actionsChanged', () => void refresh());
    const releaseExtensions = browserClient.on('extensions.changed', () => void refresh());
    void refresh();
    return () => { active = false; generation++; releaseActions(); releaseExtensions(); };
  }, [tabId]);
  return { actions: state?.actions ?? [], error };
}
