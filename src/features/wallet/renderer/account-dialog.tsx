import { useEffect, useState } from 'react';
import type { WalletChain, WalletState } from '../../../shared/contracts/wallet';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';

const names: Record<WalletChain, string> = { ethereum: 'Ethereum', solana: 'Solana', bitcoin: 'Bitcoin', filecoin: 'Filecoin', cardano: 'Cardano', polkadot: 'Polkadot', zcash: 'Zcash' };
export function AccountDialog({ state, open, onOpenChange, onState }: {
  state: WalletState; open: boolean; onOpenChange: (open: boolean) => void; onState: (state: WalletState) => void;
}) {
  const [chain, setChain] = useState<WalletChain>('ethereum');
  const [networkId, setNetworkId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const networks = state.networks.filter((network) => network.chain === chain);
    if (!networks.some((network) => network.id === networkId)) setNetworkId(networks[0]?.id ?? '');
  }, [chain, state.networks, networkId]);
  const capability = state.capabilities.find((entry) => entry.chain === chain);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="添加账户">
      <form onSubmit={async (event) => {
        event.preventDefault(); setBusy(true); setError('');
        try { onState(await browserClient.command('wallet.addAccount', { chain, networkId, name })); onOpenChange(false); }
        catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
        finally { setBusy(false); }
      }}>
        <label className="form-field"><span>链</span><select value={chain} onChange={(event) => setChain(event.target.value as WalletChain)}>
          {state.capabilities.map((entry) => <option key={entry.chain} value={entry.chain}>{names[entry.chain]}{!entry.account ? ' · 待能力接入' : ''}</option>)}
        </select></label>
        <label className="form-field"><span>网络</span><select value={networkId} onChange={(event) => setNetworkId(event.target.value)}>
          {state.networks.filter((network) => network.chain === chain).map((network) => <option key={network.id} value={network.id}>{network.name}{network.testnet ? ' · 测试网' : ''}</option>)}
        </select></label>
        <label className="form-field"><span>账户名称</span><input required maxLength={128} value={name} onChange={(event) => setName(event.target.value)} placeholder={`${names[chain]} 账户`} /></label>
        {capability?.reason && <p className="wallet-detail">{capability.reason}</p>}
        {error && <ErrorNotice message={error} />}
        <div className="form-actions"><button className="button" type="button" onClick={() => onOpenChange(false)}>取消</button><button type="submit" className="button button-primary" disabled={busy || !capability?.account || !networkId}>{busy ? '创建中…' : '添加'}</button></div>
      </form>
    </Modal>
  );
}
