import { useCallback, useEffect, useState } from 'react';
import type { WalletState } from '../../../shared/contracts/wallet';
import { browserClient } from '../../../renderer/client/browser-client';

export function useWallet(contextId: string) {
  const [state, setState] = useState<WalletState | null>(null);
  const [error, setError] = useState('');
  const accept = useCallback((next: WalletState) => setState((current) => !current || next.revision >= current.revision ? next : current), []);
  useEffect(() => {
    let alive = true;
    setState(null);
    const receive = (next: WalletState) => { if (alive) accept(next); };
    const dispose = browserClient.on('wallet.changed', receive);
    browserClient.command('wallet.get', {}).then(receive).catch((failure) => { if (alive) setError(String(failure)); });
    return () => { alive = false; dispose(); };
  }, [contextId, accept]);
  return { state, accept, error, setError };
}
