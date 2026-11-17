import { useState } from 'react';
import type { RewardsState } from '../../../shared/contracts/rewards';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';

export function AdsDeliverySettings({ state, pending, run }: {
  state: RewardsState; pending: boolean; run: (operation: () => Promise<RewardsState>) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<'enable' | 'redeem' | null>(null);
  const [maximum, setMaximum] = useState(state.adsDelivery?.maxPerHour ?? 5);
  const delivery = state.adsDelivery;
  if (!delivery) return null;
  const active = delivery.catalogStatus === 'refreshing' || delivery.confirmationStatus === 'running' || delivery.settlementStatus === 'running';
  return <section className="rewards-configuration">
    <h2>通知广告</h2>
    <p>{delivery.reason}</p>
    {delivery.error && <p role="alert" className="rewards-error">{delivery.error}</p>}
    <div className="rewards-actions">
      <label>每小时最多通知数<select value={maximum} onChange={event => setMaximum(Number(event.target.value))} disabled={pending}>
        {[1, 2, 3, 4, 5, 10].map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <button disabled={pending || !state.paymentId} onClick={() => delivery.enabled
        ? void run(() => browserClient.command('rewards.configureAdsDelivery', { enabled: false, maxPerHour: maximum, confirmed: true }))
        : setConfirm('enable')}>{delivery.enabled ? '关闭通知广告' : '开启通知广告'}</button>
      {delivery.enabled && <button disabled={pending} onClick={() => void run(() => browserClient.command('rewards.configureAdsDelivery', { enabled: true, maxPerHour: maximum, confirmed: true }))}>保存频率</button>}
      <button disabled={pending} onClick={() => void run(() => browserClient.command('rewards.refreshAds', {}))}>更新广告资源</button>
      {active && <button onClick={() => void run(() => browserClient.command('rewards.cancel', {}))}>暂停当前请求</button>}
    </div>
    <p>待确认事件 {delivery.pendingConfirmations} · 待兑换奖励凭证 {delivery.paymentTokenCount}</p>
    <div className="rewards-actions">
      <button disabled={pending || !delivery.pendingConfirmations} onClick={() => void run(() => browserClient.command('rewards.retryAdsConfirmations', {}))}>恢复广告确认</button>
      <button disabled={pending || !delivery.paymentTokenCount} onClick={() => setConfirm('redeem')}>{delivery.settlementStatus === 'unknown' ? '继续原兑换请求' : '兑换奖励凭证'}</button>
    </div>
    {delivery.settlementStatus === 'confirmed' && <p>服务已接受上次凭证兑换。BAT到账金额以收款账户余额为准。</p>}
    <details><summary>广告资源状态</summary><p>{delivery.creativeCount} 个目录通知素材；最后更新 {delivery.lastUpdatedAt ? new Date(delivery.lastUpdatedAt).toLocaleString() : '尚未更新'}。</p>
      <p>可展示通知取决于地区、有效期、频率及系统状态；有广告目录不代表已确认官方服务资格。</p></details>
    <Modal open={confirm !== null} title={confirm === 'enable' ? '开启通知广告？' : '兑换奖励凭证？'} onOpenChange={open => { if (!open) setConfirm(null); }}>
      <p>{confirm === 'enable' ? '启用后会从官方服务取得广告目录与地区信息，并在浏览器使用期间显示符合条件的系统通知。真实通知事件生成匿名确认，奖励凭证按每日计划自动兑换。' : '会向官方服务提交已有奖励凭证。结果未知时保留原批次继续，不生成新的凭证或重复增加余额。'}</p>
      <footer><button onClick={() => setConfirm(null)}>取消</button><button disabled={pending} onClick={() => {
        const action = confirm; setConfirm(null);
        void run(async () => {
          if (action === 'redeem') return browserClient.command('rewards.redeemPaymentTokens', { confirmed: true });
          await browserClient.command('rewards.refreshAds', {});
          if ((state.ads.tokenCount ?? 0) < 3) await browserClient.command('rewards.refillConfirmationTokens', { confirmed: true });
          return browserClient.command('rewards.configureAdsDelivery', { enabled: true, maxPerHour: maximum, confirmed: true });
        });
      }}>确认</button></footer>
    </Modal>
  </section>;
}
