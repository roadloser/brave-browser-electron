import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryPage } from '../../../shared/contracts/history';
import { browserClient } from '../../../renderer/client/browser-client';

export type HistoryFilter = { query: string; from?: number; to?: number };

export function useHistory(filter: HistoryFilter) {
  const [page, setPage] = useState<HistoryPage>({ entries: [], total: 0, revision: -1, nextOffset: null });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const mutating = useRef(false);

  const load = useCallback(async (offset = 0) => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const result = await browserClient.command('history.query', { ...filter, offset, limit: 100 });
      if (!mounted.current || request !== generation.current) return;
      setPage(previous => ({
        ...result,
        entries: offset > 0 && result.revision === previous.revision
          ? [...previous.entries, ...result.entries] : result.entries,
      }));
      setError('');
    } catch (problem) {
      if (mounted.current && request === generation.current) setError(problem instanceof Error ? problem.message : '历史读取失败');
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }, [filter.query, filter.from, filter.to]);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = browserClient.on('history.changed', () => void load());
    const timeout = window.setTimeout(() => void load(), 160);
    return () => { window.clearTimeout(timeout); mounted.current = false; generation.current++; unsubscribe(); };
  }, [load]);

  async function mutate(operation: () => Promise<unknown>) {
    if (mutating.current) return false;
    mutating.current = true;
    setPending(true);
    setError('');
    try {
      await operation();
      await load();
      return true;
    } catch (problem) {
      if (mounted.current) setError(problem instanceof Error ? problem.message : '历史清理失败，请重试');
      return false;
    } finally {
      mutating.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return {
    ...page, error, loading, pending, refresh: () => load(),
    loadMore: () => page.nextOffset !== null && !loading ? load(page.nextOffset) : Promise.resolve(),
    remove: (ids: string[]) => mutate(() => browserClient.command('history.remove', { ids })),
    clear: (range: { from?: number; to?: number }) => mutate(() => browserClient.command('history.clear', range)),
  };
}
