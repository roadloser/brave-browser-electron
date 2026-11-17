import { useCallback, useEffect, useState } from 'react';
import type { NewsState } from '../../../shared/contracts/content-services';
import { browserClient } from '../../../renderer/client/browser-client';

export function useNews(contextId: string) {
  const [state, setState] = useState<NewsState | null>(null);
  const [error, setError] = useState('');
  const accept = useCallback((next: NewsState) => setState((current) => !current || next.revision >= current.revision ? next : current), []);
  useEffect(() => {
    let alive = true;
    setState(null); setError('');
    const receive = (next: NewsState) => { if (alive) accept(next); };
    const dispose = browserClient.on('news.changed', receive);
    browserClient.command('news.get', {}).then((next) => {
      receive(next);
      if (alive && next.enabled && (!next.lastUpdated || Date.now() - next.lastUpdated > 30 * 60 * 1000)) {
        browserClient.command('news.refresh', {}).then(receive).catch((failure) => { if (alive) setError(String(failure)); });
      }
    }).catch((failure) => { if (alive) setError(String(failure)); });
    return () => { alive = false; dispose(); };
  }, [contextId, accept]);
  return { state, accept, error, setError };
}
