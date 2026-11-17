import { useState } from 'react';
import { Newspaper, RefreshCw, Settings2, X } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { browserClient } from '../../../renderer/client/browser-client';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { IconButton } from '../../../renderer/components/icon-button';
import { useNews } from './use-news';
import { NewsOptions } from './news-options';
import { NewsFeed } from './news-feed';
import './content-services.css';

export function NewsPanel({ tab }: { tab: TabSnapshot }) {
  const { state, accept, error, setError } = useNews(tab.contextId);
  const [options, setOptions] = useState(false);
  async function refresh() {
    try { accept(await browserClient.command('news.refresh', {})); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  if (!state) return null;
  return (
    <section className="news-panel" aria-label="Brave News">
      <header><div><h2><Newspaper size={22} />Brave News</h2>{state.enabled && state.lastUpdated && <p className="content-detail">上次更新 {new Date(state.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}</div>
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
          {(state.topicsError || state.recommendationsError) && <details className="news-resource-status">
            <summary>部分话题或来源推荐未更新，已保留可用内容</summary>
            {state.topicsError && <p>话题：{state.topicsError}</p>}
            {state.recommendationsError && <p>来源推荐：{state.recommendationsError}</p>}
          </details>}
          {state.status === 'cancelled' && <p className="content-detail">刷新已取消，保留上次内容。</p>}
          <NewsFeed state={state} contextId={tab.contextId} onState={accept} onError={setError} />
          {!state.feed.length && state.status !== 'loading' && <div className="news-empty"><p>暂无可显示的文章。选择频道、关注来源或添加 RSS 订阅。</p><button type="button" className="button" onClick={() => setOptions(true)}>自定义来源</button></div>}
        </>}
      <NewsOptions state={state} open={options} onOpenChange={setOptions} onState={accept} />
    </section>
  );
}
