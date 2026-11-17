import { useEffect, useState } from 'react';
import type { LeoState } from '../../../shared/contracts/leo';
import { browserClient } from '../../../renderer/client/browser-client';

export function useLeo(contextId: string, enabled: boolean) {
  const [state, setState] = useState<LeoState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState(null);
    const accept = (next: LeoState) => {
      if (alive) setState((current) => !current || next.revision >= current.revision ? next : current);
    };
    const dispose = browserClient.on('leo.changed', accept);
    browserClient.command('leo.get', {}).then(accept).catch((failure) => { if (alive) setError(String(failure)); });
    return () => { alive = false; dispose(); };
  }, [contextId, enabled]);
  return { state, setState, error, setError };
}
