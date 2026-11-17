import { useState } from 'react';
import DOMPurify from 'dompurify';
import { Newspaper, RefreshCw, Settings2, X } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { browserClient } from '../../../renderer/client/browser-client';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { IconButton } from '../../../renderer/components/icon-button';
import { useNews } from './use-news';
import { NewsOptions } from './news-options';
import './content-services.css';

export function NewsPanel({ tab }: { tab: TabSnapshot }) {
  const { state, accept, error, setError } = useNews(tab.contextId);
  const [options, setOptions] = useState(false);
  const [visible, setVisible] = useState(12);
  async function refresh() {
    try { accept(await browserClient.command('news.refresh', {})); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  if (!state) return null;
  return (
    <section className="news-panel" aria-label="Brave News">
      <header><h2><Newspaper size={22} />Brave News</h2>
        {state.enabled && <div className="news-actions">
          {state.status === 'loading' ? <IconButton label="取消刷新" onClick={() => browserClient.command('news.cancel', {}).then(accept).catch((failure) => setError(String(failure)))}><X size={17} /></IconButton> :
            <IconButton label="刷新新闻" onClick={() => void refresh()}><RefreshCw size={17} /></IconButton>}
          <IconButton label="新闻设置" onClick={() => setOptions(true)}><Settings2 size={17} /></IconButton>
        </div>}
      </header>
      {!state.enabled ? <div className="news-opt-in"><h3>关注您感兴趣的新闻</h3><p>启用后，从 Brave 的新闻服务获取内容，也可以添加自己的 RSS 订阅。</p>
        <button type="button" className="button button-primary" onClick={async () => {
          try { accept(await browserClient.command('news.enable', { enabled: true })); await refresh(); }
          catch (failure) { setError(String(failure)); }
        }}>启用 Brave News</button></div> :
        <>
          {state.status === 'loading' && <p className="content-detail">正在更新新闻…</p>}
          {(state.error || error) && <ErrorNotice message={error || state.error || ''} onRetry={() => void refresh()} />}
          <div className="news-grid">
            {state.articles.slice(0, visible).map((article) => <article className="news-card" key={article.id}>
              <button type="button" onClick={() => browserClient.command('browser.openTab', { url: article.url }).catch((failure) => setError(String(failure)))}>
                {article.imageUrl && <img src={article.imageUrl} loading="lazy" referrerPolicy="no-referrer" alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}
                <div className="news-card-text"><small>{article.publisherName}{article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleDateString()}` : ''}</small>
                  <h3>{article.title}</h3><p>{DOMPurify.sanitize(article.description, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })}</p></div>
              </button>
            </article>)}
          </div>
          {!state.articles.length && state.status !== 'loading' && <p className="news-empty">暂无可显示的文章。选择频道、关注来源或添加 RSS 订阅。</p>}
          {visible < state.articles.length && <button type="button" className="button news-more" onClick={() => setVisible((value) => value + 12)}>显示更多</button>}
        </>}
      <NewsOptions state={state} open={options} onOpenChange={setOptions} onState={accept} />
    </section>
  );
}
