import { useEffect, useRef, useState } from 'react';
import type { ExtensionsState } from '../../../shared/contracts/extensions';
import { browserClient } from '../../../renderer/client/browser-client';

export function useExtensions() {
  const [state, setState] = useState<ExtensionsState>({
    extensions: [], revision: -1, networkInterception: 'unavailable-native-shields', privateExtensions: 'unsupported',
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const accept = (next: ExtensionsState) => {
    if (mounted.current) setState(previous => next.revision >= previous.revision ? next : previous);
  };
  async function refresh() {
    try { accept(await browserClient.command('extensions.get', {})); if (mounted.current) setError(''); }
    catch (problem) { if (mounted.current) setError(problem instanceof Error ? problem.message : '扩展列表读取失败'); }
  }
  useEffect(() => {
    mounted.current = true;
    const release = browserClient.on('extensions.changed', accept);
    void refresh();
    return () => { mounted.current = false; release(); };
  }, []);

  async function run<Value>(operation: () => Promise<Value>): Promise<Value | undefined> {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    setError('');
    try { return await operation(); }
    catch (problem) { if (mounted.current) setError(problem instanceof Error ? problem.message : '扩展操作失败'); return undefined; }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  return { ...state, error, pending, run, refresh, accept };
}
