import { useBrowserStore } from '../../../renderer/shell/browser-store';
import { useWallet } from './use-wallet';
import { WalletPanel } from './wallet-panel';
import './wallet.css';

export function WalletPage() {
  const snapshot = useBrowserStore((state) => state.snapshot);
  const current = snapshot?.windows.find((window) => window.id === snapshot.currentWindowId);
  const { state, accept, error, setError } = useWallet(current?.contextId ?? '');
  return <WalletPanel state={state} open onOpenChange={() => undefined} onState={accept} error={error} onError={setError} embedded />;
}
