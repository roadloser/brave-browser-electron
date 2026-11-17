import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { NewsState } from '../../../shared/contracts/content-services';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { IconButton } from '../../../renderer/components/icon-button';

export function NewsOptions({ state, open, onOpenChange, onState }: {
  state: NewsState; open: boolean; onOpenChange: (open: boolean) => void; onState: (state: NewsState) => void;
}) {
  const [filter, setFilter] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<NewsState>) {
    setBusy(true); setError('');
    try { onState(await action()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onOpenChange={(next) => {
      if (!next && busy) browserClient.command('news.cancel', {}).catch(() => undefined);
      onOpenChange(next);
    }} title="自定义 Brave News" className="news-options">
      <label className="form-field"><span>地区</span><select value={state.locale} disabled={busy} onChange={(event) => void run(async () => {
        await browserClient.command('news.setLocale', { locale: event.target.value });
        return browserClient.command('news.refresh', {});
      })}>
        <option value="en-US">美国 · English</option><option value="en-GB">英国 · English</option><option value="ja-JP">日本 · 日本語</option>
        <option value="de-DE">德国 · Deutsch</option><option value="fr-FR">法国 · Français</option><option value="es-ES">西班牙 · Español</option>
        <option value="pt-BR">巴西 · Português</option><option value="it-IT">意大利 · Italiano</option>
      </select></label>
      <h3>频道</h3><div className="news-channels">
        {state.channels.map((channel) => <label key={channel.id}><input type="checkbox" checked={channel.enabled} disabled={busy}
          onChange={(event) => void run(() => browserClient.command('news.setChannel', { id: channel.id, enabled: event.target.checked }))} />{channel.name}</label>)}
        {!state.channels.length && <p className="content-detail">官方来源加载后可选择频道。</p>}
      </div>
      <h3>来源</h3><input className="text-input" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索新闻来源" aria-label="搜索新闻来源" />
      <div className="news-publisher-list">{state.publishers.filter((publisher) => publisher.name.toLowerCase().includes(filter.toLowerCase())).map((publisher) =>
        <label key={publisher.id}><input type="checkbox" checked={state.enabledPublisherIds.includes(publisher.id)} disabled={busy}
          onChange={(event) => void run(() => browserClient.command('news.setPublisher', { id: publisher.id, enabled: event.target.checked }))} /><span>{publisher.name}</span>
          {state.disabledPublisherIds.includes(publisher.id) && <small>已屏蔽</small>}</label>)}</div>
      <h3>RSS 订阅</h3>
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
        const next = await browserClient.command('news.addFeed', { url: feedUrl }); setFeedUrl(''); return next;
      }); }}>
        <div className="news-feed-form"><input className="text-input" type="url" required value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="RSS 或 Atom 地址" aria-label="订阅源地址" />
          <button className="button" type="submit" disabled={busy}>添加</button></div>
      </form>
      <div className="news-feed-list">{state.directFeeds.map((feed) => <div key={feed.id}><span>{feed.title}{feed.error && <small>{feed.error}</small>}</span>
        <IconButton label={`移除 ${feed.title}`} disabled={busy} onClick={() => void run(() => browserClient.command('news.removeFeed', { id: feed.id }))}><Trash2 size={14} /></IconButton></div>)}</div>
      {error && <ErrorNotice message={error} />}
      <div className="form-actions"><button type="button" className="button button-danger" disabled={busy}
        onClick={() => void run(async () => { const next = await browserClient.command('news.enable', { enabled: false }); onOpenChange(false); return next; })}>停用新闻</button>
        <button type="button" className="button button-primary" onClick={() => onOpenChange(false)}>完成</button></div>
    </Modal>
  );
}
