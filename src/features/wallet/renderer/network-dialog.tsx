import { useState } from 'react';
import { walletChainSchema, type WalletChain, type WalletState } from '../../../shared/contracts/wallet';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';

export function NetworkDialog({ open, onOpenChange, onState }: { open: boolean; onOpenChange: (open: boolean) => void; onState: (state: WalletState) => void }) {
  const [chain, setChain] = useState<WalletChain>('ethereum');
  const [name, setName] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [chainId, setChainId] = useState('');
  const [symbol, setSymbol] = useState('ETH');
  const [decimals, setDecimals] = useState(18);
  const [testnet, setTestnet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="添加网络" open={open} onOpenChange={onOpenChange}>
      <form onSubmit={async (event) => {
        event.preventDefault(); setBusy(true); setError('');
        try { onState(await browserClient.command('wallet.addNetwork', { id: crypto.randomUUID(), chain, name, rpcUrl, chainId: chainId || undefined, symbol, decimals, testnet })); onOpenChange(false); }
        catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
        finally { setBusy(false); }
      }}>
        <label className="form-field"><span>链</span><select value={chain} onChange={(event) => setChain(event.target.value as WalletChain)}>{walletChainSchema.options.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
        <label className="form-field"><span>网络名称</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="form-field"><span>RPC / 链 API 地址</span><input type="url" required value={rpcUrl} onChange={(event) => setRpcUrl(event.target.value)} placeholder="https://" /></label>
        {chain === 'ethereum' && <label className="form-field"><span>Chain ID</span><input required value={chainId} onChange={(event) => setChainId(event.target.value)} placeholder="0x1" /></label>}
        <div className="wallet-form-grid"><label className="form-field"><span>币种符号</span><input required value={symbol} onChange={(event) => setSymbol(event.target.value)} /></label>
          <label className="form-field"><span>精度</span><input type="number" min={0} max={36} value={decimals} onChange={(event) => setDecimals(Number(event.target.value))} /></label></div>
        <label><input type="checkbox" checked={testnet} onChange={(event) => setTestnet(event.target.checked)} />测试网络</label>
        <p className="wallet-detail">自定义网络提供者可看到您查询的地址。Cardano 使用 Blockfrost 格式 API，Bitcoin 使用 Esplora 格式 API。</p>
        {error && <ErrorNotice message={error} />}
        <div className="form-actions"><button type="button" className="button" onClick={() => onOpenChange(false)}>取消</button><button type="submit" className="button button-primary" disabled={busy}>添加网络</button></div>
      </form>
    </Modal>
  );
}
