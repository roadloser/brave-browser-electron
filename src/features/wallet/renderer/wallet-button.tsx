import { useState } from 'react';
import { Wallet } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { IconButton } from '../../../renderer/components/icon-button';
import { useWallet } from './use-wallet';
import { WalletPanel } from './wallet-panel';
import { TransactionConfirmation } from './transaction-confirmation';
import './wallet.css';

export function WalletButton({ tab }: { tab?: TabSnapshot }) {
  const [open, setOpen] = useState(false);
  const { state, accept, error, setError } = useWallet(tab?.contextId ?? '');
  const request = state?.requests.find((entry) => entry.status === 'pending');
  return (
    <>
      <IconButton label={request ? '钱包有待确认请求' : 'Brave Wallet'} disabled={!tab} active={open} className={request ? 'wallet-pending' : ''}
        onClick={() => setOpen((value) => !value)}><Wallet size={18} /></IconButton>
      <WalletPanel state={state} open={open} onOpenChange={setOpen} onState={accept} error={error} onError={setError} />
      <TransactionConfirmation key={request?.id ?? 'none'} request={request} locked={state?.locked ?? true} onState={accept} />
    </>
  );
}
