import { useState } from 'react';
import type { RewardsAdHistoryItem } from '../../../shared/contracts/rewards';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import './ads-history.css';

export function AdsHistoryPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RewardsAdHistoryItem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setOpen(true); setPending(true); setError('');
    try { setItems(await browserClient.command('rewards.adsHistory', {})); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '广告历史读取失败'); }
    finally { setPending(false); }
  }
  async function react(item: RewardsAdHistoryItem, action: 'like' | 'dislike' | 'flag') {
    setPending(true); setError('');
    try { setItems(await browserClient.command('rewards.reactToAd', { placementId: item.id, action })); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '广告反馈保存失败'); }
    finally { setPending(false); }
  }
  return <section className="rewards-configuration">
    <h2>广告历史</h2><p>查看最近30天实际显示过的通知广告，管理喜欢、不喜欢和不适当反馈。</p>
    <button onClick={() => void load()}>查看广告历史</button>
    <Modal open={open} title="最近30天的广告" onOpenChange={setOpen} className="ads-history-modal">
      {error && <p className="rewards-error" role="alert">{error}</p>}
      {!items.length && <p>{pending ? '正在读取…' : '这份资料还没有实际展示的广告记录。'}</p>}
      <div className="ads-history-list">{items.map(item => <article key={item.id} className="ads-history-item">
        <time dateTime={new Date(item.shownAt).toISOString()}>{new Date(item.shownAt).toLocaleString()}</time>
        <strong>{item.title}</strong><p>{item.body}</p>
        <button onClick={() => void browserClient.command('browser.openTab', { url: item.targetUrl, active: true }).catch(problem => setError(problem instanceof Error ? problem.message : '广告网站打开失败'))}>访问广告网站</button>
        <div className="rewards-actions">
          <button aria-pressed={item.reaction === 'liked'} disabled={pending || !item.canReact} onClick={() => void react(item, 'like')}>{item.reaction === 'liked' ? '取消喜欢' : '喜欢'}</button>
          <button aria-pressed={item.reaction === 'disliked'} disabled={pending || !item.canReact} onClick={() => void react(item, 'dislike')}>{item.reaction === 'disliked' ? '取消不喜欢' : '不喜欢此广告主'}</button>
          <button aria-pressed={item.flagged} disabled={pending} onClick={() => void react(item, 'flag')}>{item.flagged ? '撤销不适当标记' : '标记不适当'}</button>
        </div>
      </article>)}</div>
    </Modal>
  </section>;
}
