import { useEffect, useState } from 'react';
import type { RewardsState } from '../../../shared/contracts/rewards';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import './rewards.css';

export function RewardsPanel() {
  const [state, setState] = useState<RewardsState | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [country, setCountry] = useState('');
  const [solanaRpcUrl, setSolanaRpcUrl] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const accept = (next: RewardsState) => { if (active) setState(previous => !previous || next.revision >= previous.revision ? next : previous); };
    const release = browserClient.on('rewards.changed', accept);
    void browserClient.command('rewards.get', {}).then(next => { if (active) { accept(next); setEndpoint(next.endpoint); setCountry(next.country ?? ''); setSolanaRpcUrl(next.solanaRpcUrl ?? ''); } }).catch(problem => { if (active) setError(problem instanceof Error ? problem.message : 'Rewards读取失败'); });
    return () => { active = false; release(); };
  }, []);

  async function run(operation: () => Promise<RewardsState>) {
    setPending(true); setError('');
    try { setState(await operation()); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Rewards操作失败'); }
    finally { setPending(false); }
  }

  return <section className="rewards-panel">
    <header><h1>Brave Rewards</h1><p>账户、广告与结算状态</p></header>
    <div className="rewards-summary"><strong>{state?.balance.status === 'confirmed' ? state.balance.amount : '—'}</strong><span>BAT</span>
      <small>{state?.balance.status === 'confirmed' ? '服务确认余额' : '余额尚未取得服务确认'}</small></div>
    {(error || state?.error) && <p className="rewards-error" role="alert">{error || state?.error}</p>}
    {state && <>
      <div className="rewards-status-grid">
        <article><h2>Rewards钱包</h2><p>{state.paymentId ? '已注册' : '尚未注册'}</p>{state.paymentId && <code>{state.paymentId}</code>}</article>
        <article><h2>收款账户</h2><p>{state.linked ? `已连接 ${state.provider ?? ''}` : state.linked === false ? '未连接' : '状态未知'}</p></article>
        <article><h2>广告</h2><p>{state.ads.status === 'eligible' ? '已确认资格' : '资格尚未确认'}</p><small>{state.ads.reason}</small></article>
        <article><h2>结算</h2><p>{state.settlement.status === 'confirmed' ? '服务已确认' : '尚未取得结算状态'}</p></article>
      </div>
      <section className="rewards-actions">
        <label>所在国家或地区代码<input maxLength={2} value={country} placeholder="例如 US" onChange={event => setCountry(event.target.value.toUpperCase())} disabled={Boolean(state.paymentId)} /></label>
        {!state.paymentId && <button disabled={pending || !state.endpoint || !/^[A-Z]{2}$/.test(country)} onClick={() => setConfirmOpen(true)}>注册Rewards钱包</button>}
        {state.paymentId && <button disabled={pending} onClick={() => void run(() => browserClient.command('rewards.refresh', {}))}>刷新账户状态</button>}
        {state.paymentId && !state.linked && <button disabled={pending || !state.selfCustodyAvailable} onClick={() => setConnectOpen(true)}>连接自托管收款账户</button>}
        {(['registering', 'refreshing'].includes(state.status) || state.account.status === 'pending') && <button onClick={() => void browserClient.command('rewards.cancel', {}).then(setState).catch(() => undefined)}>取消请求或等待</button>}
      </section>
      <details className="rewards-configuration"><summary>服务接入配置</summary>
        <p>使用已获准接入的服务地址和凭据。填写配置不代表官方服务已接受此客户端。</p>
        <form onSubmit={event => { event.preventDefault(); void run(async () => {
          const next = await browserClient.command('rewards.configure', { endpoint, serviceKey: serviceKey || undefined, solanaRpcUrl: solanaRpcUrl || undefined });
          setServiceKey(''); return next;
        }); }}>
          <label>Rewards grant 服务地址<input type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} required placeholder="https://" /></label>
          <label>服务密钥<input type="password" autoComplete="off" value={serviceKey} onChange={event => setServiceKey(event.target.value)} placeholder={state.hasServiceKey ? '已保存，留空保持不变' : '凭据不进入页面状态'} /></label>
          <label>Solana RPC（用于查询自托管BAT余额）<input type="url" value={solanaRpcUrl} onChange={event => setSolanaRpcUrl(event.target.value)} placeholder="https://" /></label>
          <button disabled={pending}>保存配置</button>
        </form>
      </details>
      <details className="rewards-capabilities"><summary>能力与接入状态</summary><ul>
        {state.capabilities.map(capability => <li key={capability.operation}><strong>{capability.operation}</strong><span>{capability.status === 'implemented' ? '客户端已接入，待服务观察' : '尚未完成接入'}</span><p>{capability.reason}</p></li>)}
      </ul></details>
    </>}
    <Modal open={confirmOpen} title="创建Rewards钱包？" className="rewards-confirm" onOpenChange={setConfirmOpen}>
      <p>会生成加密保存在本资料中的Rewards钱包身份，并向已配置服务发送国家/地区代码 {country} 与签名注册请求。</p>
      <p>注册后真实余额、广告资格与结算仍取决于服务和收款账户。</p>
      <footer><button disabled={pending} onClick={() => setConfirmOpen(false)}>取消</button>
        <button disabled={pending} onClick={() => { setConfirmOpen(false); void run(() => browserClient.command('rewards.register', { geoCountry: country, confirmed: true })); }}>确认注册</button></footer>
    </Modal>
    <Modal open={connectOpen} title="连接Solana自托管收款账户？" className="rewards-confirm" onOpenChange={setConnectOpen}>
      <p>将向Rewards服务申请一次性挑战，并打开官方连接页面。账户只有在服务确认后才显示已连接。</p>
      <footer><button onClick={() => setConnectOpen(false)}>取消</button><button onClick={() => {
        setConnectOpen(false); void run(() => browserClient.command('rewards.connectSelfCustody', { confirmed: true }));
      }}>打开官方连接页面</button></footer>
    </Modal>
  </section>;
}
