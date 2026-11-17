import { useState } from 'react';
import type { WalletRequest, WalletState } from '../../../shared/contracts/wallet';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';

export function TransactionConfirmation({ request, locked, onState }: {
  request: WalletRequest | undefined; locked: boolean; onState: (state: WalletState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function reject() {
    if (!request || busy) return;
    try { onState(await browserClient.command('wallet.reject', { id: request.id })); }
    catch (failure) { setError(String(failure)); }
  }
  return (
    <Modal title={request?.summary ?? '钱包请求'} open={Boolean(request)} onOpenChange={(open) => { if (!open) void reject(); }}>
      {request && <>
        {request.origin && <p className="wallet-origin">请求来源：{request.origin}</p>}
        <dl className="wallet-request-details">{Object.entries(request.details).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
        {(request.kind === 'transfer' || request.kind === 'transaction') && <p className="wallet-detail">确认后将签名并广播。请核对网络、地址、金额和网络费。</p>}
        {locked && <p className="wallet-detail">钱包已锁定，请先解锁。</p>}
        {error && <ErrorNotice message={error} />}
        <div className="form-actions"><button className="button" type="button" disabled={busy} onClick={() => void reject()}>拒绝</button>
          <button className="button button-primary" type="button" disabled={busy || locked} onClick={async () => {
            setBusy(true); setError('');
            try { onState(await browserClient.command('wallet.approve', { id: request.id, confirmed: true })); }
            catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
            finally { setBusy(false); }
          }}>{busy ? '处理中…' : request.kind === 'connect' ? '允许连接' : '确认签名'}</button></div>
      </>}
    </Modal>
  );
}
