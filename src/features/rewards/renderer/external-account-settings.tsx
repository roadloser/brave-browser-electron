import { useState } from 'react';
import type { RewardsProviderName, RewardsState } from '../../../shared/contracts/rewards';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';

const names: Record<RewardsProviderName, string> = { uphold: 'Uphold', bitflyer: 'bitFlyer', zebpay: 'ZebPay' };
const statuses = { authorizing: '等待官方授权', preparing: '准备收款账户', claiming: '等待Rewards确认', connected: '已连接', unknown: '上次连接结果待确认', failed: '连接未完成', 'signed-out': '已在本机注销' };
export function ExternalAccountSettings({ state, pending, run }: {
  state: RewardsState; pending: boolean; run: (operation: () => Promise<RewardsState>) => Promise<void>;
}) {
  const [provider, setProvider] = useState<RewardsProviderName>('uphold');
  const [confirm, setConfirm] = useState<'connect' | 'resume' | 'signout' | null>(null);
  const account = state.externalAccount;
  const working = account && ['authorizing', 'preparing', 'claiming'].includes(account.status);
  return <section className="rewards-configuration">
    <h2>托管收款账户</h2>
    {account && <p>{names[account.provider]} · {statuses[account.status]} {account.displayName ? `· ${account.displayName}` : ''}</p>}
    {account?.error && <p className="rewards-error" role="alert">{account.error}</p>}
    <p>可连接账户取决于官方服务、所在地区和身份认证要求。登录凭据仅加密保存在本机。</p>
    <div className="rewards-actions">
      <label>收款方<select value={provider} onChange={event => setProvider(event.target.value as RewardsProviderName)} disabled={pending || Boolean(working)}>
        {(Object.keys(names) as RewardsProviderName[]).map(name => <option key={name} value={name}>{names[name]}</option>)}
      </select></label>
      <button disabled={pending || !state.paymentId || Boolean(working) || account?.status === 'connected' || account?.status === 'unknown'} onClick={() => setConfirm('connect')}>连接账户</button>
      {account?.status === 'unknown' && <button disabled={pending} onClick={() => setConfirm('resume')}>继续原连接</button>}
      {account?.status === 'connected' && <button disabled={pending} onClick={() => void run(() => browserClient.command('rewards.refreshExternalBalance', {}))}>刷新收款余额</button>}
      {working && <button onClick={() => void run(() => browserClient.command('rewards.cancel', {}))}>取消账户操作</button>}
      {account && !working && account.status !== 'signed-out' && <button disabled={pending} onClick={() => setConfirm('signout')}>在本机注销</button>}
    </div>
    <Modal open={confirm !== null} title={confirm === 'signout' ? '在本机注销收款账户？' : confirm === 'resume' ? '继续原收款连接？' : `连接${names[provider]}？`} onOpenChange={open => { if (!open) setConfirm(null); }}>
      <p>{confirm === 'signout' ? '将删除本资料保存的收款访问凭据。官方服务上的账户绑定和资金不会因此撤销，请在服务方管理。' : confirm === 'resume' ? '使用已保存的同一账户凭据继续官方连接步骤，不创建新的Rewards钱包。' : '将打开官方授权页面。完成后向Rewards提交连接证明，只有服务确认后才显示已连接。Uphold会在需要时建立Brave Browser BAT收款卡。'}</p>
      <footer><button onClick={() => setConfirm(null)}>取消</button><button onClick={() => {
        const action = confirm; setConfirm(null);
        void run(() => action === 'signout' ? browserClient.command('rewards.signOutExternal', { confirmed: true }) : action === 'resume'
          ? browserClient.command('rewards.resumeExternal', { confirmed: true }) : browserClient.command('rewards.connectExternal', { provider, confirmed: true }));
      }}>确认</button></footer>
    </Modal>
  </section>;
}
