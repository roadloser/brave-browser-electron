import { useState } from 'react';
import type { VpnState } from '../../../shared/contracts/vpn';
import { browserClient } from '../../../renderer/client/browser-client';

export function VpnAccountForm({ state, disabled, perform }: { state?: VpnState; disabled: boolean; perform: (operation: () => Promise<VpnState | void>) => Promise<void> }) {
  const [kind, setKind] = useState<'brave-premium' | 'subscriber'>('brave-premium');
  const [credential, setCredential] = useState('');
  return <details><summary>{state?.hasCredential ? '管理订阅授权' : '配置订阅授权'}</summary>
    <p>需要有效的 Brave VPN 订阅。账户网页登录不会自动将授权带入此应用；可提供已有的合法授权凭据。</p>
    <button disabled={disabled} onClick={() => void perform(() => browserClient.command('vpn.openAccount', {}))}>打开 Brave 账户</button>
    <form onSubmit={event => {
      event.preventDefault();
      const value = credential.trim();
      setCredential('');
      if (value) void perform(() => browserClient.command('vpn.setCredential', { kind, value }));
    }}>
      <label>授权类型 <select disabled={disabled} value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="brave-premium">Brave Premium 授权</option><option value="subscriber">已有 Guardian 订阅凭据</option></select></label>
      <label>凭据 <input type="password" autoComplete="off" spellCheck={false} value={credential} disabled={disabled || state?.secretStorageAvailable === false} onChange={event => setCredential(event.target.value)} /></label>
      <button type="submit" disabled={disabled || !credential.trim() || state?.secretStorageAvailable === false}>加密保存授权</button>
    </form>
    <p>{state?.credentialValidated ? '供应商已为此配置签发连接凭据。' : state?.hasCredential ? '授权已保存，准备服务器配置时确认订阅资格。' : '尚未保存授权。'}</p>
    <button disabled={disabled || !state?.hasCredential} onClick={() => {
      if (window.confirm('移除此资料的订阅凭据？已安装的系统VPN配置不会自动删除。')) void perform(() => browserClient.command('vpn.forgetCredential', { confirmed: true }));
    }}>忘记订阅凭据</button>
  </details>;
}
