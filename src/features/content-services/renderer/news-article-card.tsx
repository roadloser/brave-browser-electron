import DOMPurify from 'dompurify';
import type { NewsArticle, NewsState } from '../../../shared/contracts/content-services';
import { browserClient } from '../../../renderer/client/browser-client';
import { NewsImage } from './news-image';
import { NewsSourceAction } from './news-source-action';

export function NewsArticleCard({ article, kind, discover, state, contextId, onState, onError }: {
  article: NewsArticle; kind: 'hero' | 'article'; discover: boolean; state: NewsState; contextId: string;
  onState: (state: NewsState) => void; onError: (message: string) => void;
}) {
  return (
    <article className={`news-v2-card news-v2-${kind}`} data-discover={discover}>
      <button type="button" className="news-v2-article-link" onClick={() => {
        browserClient.command('browser.openTab', { url: article.url }).catch((error) => onError(error instanceof Error ? error.message : String(error)));
      }}>
        <NewsImage articleId={article.id} imageUrl={article.imageUrl} contextId={contextId} />
        <div className="news-v2-article-text">
          {discover && <span className="news-discovery-label">发现</span>}
          <h3>{article.title}</h3>
          {kind === 'hero' && article.description && <p>{DOMPurify.sanitize(article.description, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })}</p>}
        </div>
      </button>
      <div className="news-v2-meta"><span>{article.publisherName}</span>
        {article.publishedAt > 0 && <time dateTime={new Date(article.publishedAt).toISOString()}>{new Date(article.publishedAt).toLocaleDateString()}</time>}
        <NewsSourceAction publisherId={article.publisherId} state={state} onState={onState} onError={onError} />
      </div>
    </article>
  );
}
