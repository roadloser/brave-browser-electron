import { useEffect, useState } from 'react';
import type { NewsState } from '../../../shared/contracts/content-services';
import { NewsArticleCard } from './news-article-card';
import { NewsDiscoverCard } from './news-discover-card';
import './news-feed.css';

export function NewsFeed({ state, contextId, onState, onError }: {
  state: NewsState; contextId: string; onState: (state: NewsState) => void; onError: (message: string) => void;
}) {
  const [visible, setVisible] = useState(12);
  useEffect(() => setVisible(12), [contextId, state.locale]);
  const articles = new Map(state.articles.map((article) => [article.id, article]));
  return <>
    <div className="news-v2-feed">
      {state.feed.slice(0, visible).map((item) => {
        if (item.kind === 'discover') return <NewsDiscoverCard key={item.id} publisherIds={item.publisherIds} state={state} onState={onState} onError={onError} />;
        if (item.kind === 'cluster') return <section key={item.id} className={`news-cluster news-cluster-${item.clusterType}`} aria-label={item.title}>
          <header><span>{item.clusterType === 'topic' ? '热点话题' : '频道精选'}</span><h3>{item.title}</h3></header>
          <div>{item.elements.map((element, index) => {
            const article = articles.get(element.articleId);
            return article ? <NewsArticleCard key={`${element.articleId}-${index}`} article={article} kind={element.kind} discover={element.discover}
              state={state} contextId={contextId} onState={onState} onError={onError} /> : null;
          })}</div>
        </section>;
        const article = articles.get(item.articleId);
        return article ? <NewsArticleCard key={item.id} article={article} kind={item.kind} discover={item.discover}
          state={state} contextId={contextId} onState={onState} onError={onError} /> : null;
      })}
    </div>
    {visible < state.feed.length && <button type="button" className="button news-more" onClick={() => setVisible((count) => count + 12)}>显示更多</button>}
  </>;
}
