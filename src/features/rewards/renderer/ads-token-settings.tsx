import { useState } from 'react';
import type { RewardsState } from '../../../shared/contracts/rewards';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';

export function AdsTokenSettings({ state, pending, run }: {
  state: RewardsState; pending: boolean; run: (operation: () => Promise<RewardsState>) => Promise<void>;
}) {
  const [endpoint, setEndpoint] = useState('');
  const [keys, setKeys] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requesting = state.ads.tokenStatus === 'requesting' || state.ads.tokenStatus === 'awaiting-signature';
  return <details className="rewards-configuration">
    <summary>广告确认token接入</summary>
    <p>已保存 {state.ads.tokenCount ?? 0} 个未使用token。token就绪只表示盲签客户端完成，不表示已获广告展示或结算资格。</p>
    {state.ads.error && <p className="rewards-error" role="alert">{state.ads.error}</p>}
    <form onSubmit={event => {
      event.preventDefault();
      void run(() => browserClient.command('rewards.configureAds', {
        nonAnonymousEndpoint: endpoint, issuerPublicKeys: keys.split(/\s+/).filter(Boolean),
      }));
    }}>
      <label>非匿名token服务地址<input type="url" required value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="https://" /></label>
      <label>可信issuer公钥（每行一个Base64公钥）<textarea required rows={4} value={keys} onChange={event => setKeys(event.target.value)} /></label>
      <p>仅填写由独立官方issuer清单或已获准服务配置取得的公钥。不要将同一签名响应中的公钥直接作为信任依据。</p>
      <button disabled={pending}>保存接入配置</button>
    </form>
    <div className="rewards-actions"><button disabled={pending || !state.paymentId} onClick={() => setConfirmOpen(true)}>请求确认token</button>
      {requesting && <button onClick={() => void run(() => browserClient.command('rewards.cancel', {}))}>取消token请求</button>}</div>
    <Modal open={confirmOpen} title="请求广告确认token？" onOpenChange={setConfirmOpen}>
      <p>会生成并加密保存一批盲签token，通过配置的服务取得签名，再核对可信issuer与批量证明。此操作不会模拟广告展示或增加余额。</p>
      <footer className="form-actions"><button onClick={() => setConfirmOpen(false)}>取消</button><button onClick={() => {
        setConfirmOpen(false); void run(() => browserClient.command('rewards.refillConfirmationTokens', { confirmed: true }));
      }}>确认请求</button></footer>
    </Modal>
  </details>;
}
