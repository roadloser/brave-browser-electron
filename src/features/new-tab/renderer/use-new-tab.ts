import { useCallback, useEffect, useState } from 'react';
import type { NewTabState } from '../../../shared/contracts/new-tab';
import { browserClient } from '../../../renderer/client/browser-client';

export function useNewTab(contextId: string) {
  const [state, setState] = useState<NewTabState | null>(null);
  const [error, setError] = useState('');
  const accept = useCallback((next: NewTabState) => setState((current) =>
    !current || next.revision >= current.revision ? next : current), []);
  useEffect(() => {
    let alive = true;
    setState(null);
    const receive = (next: NewTabState) => { if (alive) accept(next); };
    const dispose = browserClient.on('newTab.changed', receive);
    browserClient.command('newTab.get', {}).then(receive).catch((failure) => {
      if (alive) setError(failure instanceof Error ? failure.message : String(failure));
    });
    return () => { alive = false; dispose(); };
  }, [contextId, accept]);
  return { state, error, accept, setError };
}
