import { useState } from 'react';
import { LockKeyhole, WalletCards } from 'lucide-react';
import type { WalletState } from '../../../shared/contracts/wallet';
import { browserClient } from '../../../renderer/client/browser-client';
import { ErrorNotice } from '../../../renderer/components/error-notice';

export function VaultPanel({ initialized, onState }: { initialized: boolean; onState: (state: WalletState) => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(importWallet: boolean) {
    if (!initialized && password !== confirmation) { setError('两次输入的密码不一致'); return; }
    setBusy(true); setError('');
    try {
      const next = await browserClient.command(initialized ? 'wallet.unlock' : importWallet ? 'wallet.import' : 'wallet.create', { password });
      setPassword(''); setConfirmation(''); onState(next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  return (
    <div className="wallet-vault">
      {initialized ? <LockKeyhole size={38} /> : <WalletCards size={38} />}
      <h3>{initialized ? '解锁钱包' : '您的资产，由您掌握'}</h3>
      <p>{initialized ? '输入此资料的钱包密码。' : '创建钱包或导入已有助记词。私钥由本机加密保存。'}</p>
      <form onSubmit={(event) => { event.preventDefault(); void run(false); }}>
        <label className="form-field"><span>钱包密码</span><input type="password" value={password} autoComplete={initialized ? 'current-password' : 'new-password'}
          minLength={initialized ? 1 : 8} required onChange={(event) => setPassword(event.target.value)} /></label>
        {!initialized && <label className="form-field"><span>确认密码</span><input type="password" value={confirmation} required minLength={8} autoComplete="new-password" onChange={(event) => setConfirmation(event.target.value)} /></label>}
        {error && <ErrorNotice message={error} />}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? '处理中…' : initialized ? '解锁' : '创建钱包'}</button>
        {!initialized && <button className="button" type="button" disabled={busy || password.length < 8} onClick={() => void run(true)}>从助记词文件导入</button>}
      </form>
    </div>
  );
}
