import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Copy, KeyRound, LockKeyhole, Plus, RefreshCw, Settings2 } from 'lucide-react';
import type { WalletState } from '../../../shared/contracts/wallet';
import { browserClient } from '../../../renderer/client/browser-client';
import { DockedPanel } from '../../../renderer/components/docked-panel';
import { IconButton } from '../../../renderer/components/icon-button';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { VaultPanel } from './vault-panel';
import { AccountDialog } from './account-dialog';
import { NetworkDialog } from './network-dialog';
import { TransferDialog } from './transfer-dialog';

function WalletContainer({ embedded, open, onOpenChange, children }: {
  embedded: boolean; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode;
}) {
  return embedded ? <section className="wallet-page-content">{children}</section> :
    <DockedPanel open={open} onOpenChange={onOpenChange} title="Brave Wallet">{children}</DockedPanel>;
}

export function WalletPanel({ state, open, onOpenChange, onState, error, onError, embedded = false }: {
  state: WalletState | null; open: boolean; onOpenChange: (open: boolean) => void;
  onState: (state: WalletState) => void; error: string; onError: (error: string) => void;
  embedded?: boolean;
}) {
  const [addAccount, setAddAccount] = useState(false);
  const [addNetwork, setAddNetwork] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [backup, setBackup] = useState(false);
  const [password, setPassword] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const account = state?.accounts.find((entry) => entry.id === state.selectedAccountId);
  const network = state?.networks.find((entry) => entry.id === account?.networkId);
  const balance = account ? state?.balances[account.id] : undefined;
  const capability = state?.capabilities.find((entry) => entry.chain === account?.chain);
  return (
    <>
      <WalletContainer embedded={embedded} open={open} onOpenChange={onOpenChange}>
        {!state ? <p className="wallet-detail">正在读取钱包…</p> :
          state.locked ? <VaultPanel initialized={state.initialized} onState={onState} /> :
            <div className="wallet-panel">
              <div className="wallet-controls">
                <select aria-label="账户" value={account?.id ?? ''} onChange={(event) => browserClient.command('wallet.selectAccount', { id: event.target.value }).then(onState).catch((failure) => onError(String(failure)))}>
                  {!state.accounts.length && <option value="">添加您的第一个账户</option>}
                  {state.accounts.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </select>
                <IconButton label="添加账户" onClick={() => setAddAccount(true)}><Plus size={17} /></IconButton>
                <IconButton label="添加网络" onClick={() => setAddNetwork(true)}><Settings2 size={16} /></IconButton>
                <IconButton label="锁定钱包" onClick={() => browserClient.command('wallet.lock', {}).then(onState).catch((failure) => onError(String(failure)))}><LockKeyhole size={16} /></IconButton>
              </div>
              {account && network && <>
                <div className="wallet-account-summary">
                  <p>{network.name}{network.testnet ? ' · 测试网' : ''}</p>
                  <h3>{balance?.formatted ?? '余额尚未读取'}</h3>
                  <div className="wallet-address"><span title={account.address}>{account.address}</span>
                    <IconButton label="复制公开地址" onClick={() => navigator.clipboard.writeText(account.address).catch((failure) => onError(String(failure)))}><Copy size={14} /></IconButton></div>
                  {balance?.error && <ErrorNotice message={balance.error} />}
                  {account.discovery?.status === 'scanning' && <p className="wallet-detail">正在扫描接收与找零地址…</p>}
                  {account.discovery?.error && <ErrorNotice message={account.discovery.error} />}
                  {account.receiveIndex !== undefined && <p className="wallet-detail">接收地址 #{account.receiveIndex} · 找零地址 #{account.changeIndex ?? 0}</p>}
                  <div className="wallet-quick-actions">
                    <button className="button button-primary" type="button" disabled={!capability?.transfer} onClick={() => setTransfer(true)}><ArrowUpRight size={16} />发送</button>
                    <button className="button" type="button" disabled={refreshing} onClick={async () => {
                      setRefreshing(true);
                      try { onState(await browserClient.command('wallet.refresh', { accountId: account.id })); }
                      catch (failure) { onError(String(failure)); }
                      finally { setRefreshing(false); }
                    }}><RefreshCw size={15} />{refreshing ? '刷新中…' : '刷新'}</button>
                    <IconButton label="查看助记词备份" onClick={() => setBackup(true)}><KeyRound size={16} /></IconButton>
                  </div>
                  {capability?.reason && <p className="wallet-detail">{capability.reason}</p>}
                </div>
                <section className="wallet-activity"><h3>交易记录</h3>
                  {state.transactions.filter((entry) => entry.accountId === account.id).map((entry) => <div className="wallet-transaction" key={entry.id}>
                    <div><strong>{entry.value} {network.symbol}</strong><span>{({ pending: '等待链上确认', confirmed: '已确认', rejected: '已拒绝', failed: '失败', unknown: '状态未知' })[entry.status]}</span></div>
                    <small title={entry.to}>{entry.to}</small>
                    {entry.hash && <code>{entry.hash}</code>}
                    {entry.error && <p>{entry.error}</p>}
                    {['unknown', 'pending'].includes(entry.status) && <button type="button" className="button" onClick={() => browserClient.command('wallet.refreshTransaction', { id: entry.id }).then(onState).catch((failure) => onError(String(failure)))}>重新查询</button>}
                  </div>)}
                  {!state.transactions.some((entry) => entry.accountId === account.id) && <p className="wallet-detail">暂无交易记录</p>}
                </section>
              </>}
              {!account && <div className="wallet-empty"><h3>钱包已准备就绪</h3><p>添加账户后查看地址和余额。</p><button className="button button-primary" onClick={() => setAddAccount(true)}>添加账户</button></div>}
              <details className="wallet-capabilities"><summary>链能力与当前差异</summary>{state.capabilities.map((entry) => <p key={entry.chain}><strong>{entry.chain}</strong>：{entry.account ? '账户' : '待接入'}{entry.transfer ? ' · 转账' : ''}{entry.reason ? ` — ${entry.reason}` : ''}</p>)}</details>
            </div>}
        {error && <ErrorNotice message={error} onDismiss={() => onError('')} />}
      </WalletContainer>
      {state && <AccountDialog state={state} open={addAccount} onOpenChange={setAddAccount} onState={onState} />}
      <NetworkDialog open={addNetwork} onOpenChange={setAddNetwork} onState={onState} />
      {account && network && <TransferDialog account={account} network={network} open={transfer} onOpenChange={setTransfer} onState={onState} />}
      <Modal title="验证密码后查看助记词" open={backup} onOpenChange={(value) => { setBackup(value); if (!value) setPassword(''); }}>
        <form onSubmit={async (event) => {
          event.preventDefault();
          try { await browserClient.command('wallet.backup', { password }); setBackup(false); setPassword(''); }
          catch (failure) { onError(String(failure)); }
        }}>
          <label className="form-field"><span>钱包密码</span><input type="password" required value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} /></label>
          <div className="form-actions"><button className="button button-primary" type="submit">查看备份</button></div>
        </form>
      </Modal>
    </>
  );
}
