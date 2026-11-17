import { useState } from 'react';
import type { WalletAccount, WalletNetwork, WalletState } from '../../../shared/contracts/wallet';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';

export function TransferDialog({ account, network, open, onOpenChange, onState }: {
  account: WalletAccount; network: WalletNetwork; open: boolean; onOpenChange: (open: boolean) => void; onState: (state: WalletState) => void;
}) {
  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`发送 ${network.symbol}`} open={open} onOpenChange={onOpenChange}>
      <form onSubmit={async (event) => {
        event.preventDefault(); setBusy(true); setError('');
        try { onState(await browserClient.command('wallet.requestTransfer', { accountId: account.id, to, value })); onOpenChange(false); }
        catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
        finally { setBusy(false); }
      }}>
        <p className="wallet-detail">{account.name} · {network.name}{network.testnet ? ' · 测试网' : ''}</p>
        <label className="form-field"><span>收款地址</span><input required value={to} onChange={(event) => setTo(event.target.value)} spellCheck={false} /></label>
        <label className="form-field"><span>金额（{network.symbol}）</span><input required inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" value={value} onChange={(event) => setValue(event.target.value)} /></label>
        {error && <ErrorNotice message={error} />}
        <div className="form-actions"><button type="button" className="button" disabled={busy} onClick={() => onOpenChange(false)}>取消</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? '估算网络费…' : '查看并确认'}</button></div>
      </form>
    </Modal>
  );
}
