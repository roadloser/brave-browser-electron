import { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import type { NewsState } from '../../../shared/contracts/content-services';
import { browserClient } from '../../../renderer/client/browser-client';

export function NewsDiscoverCard({ publisherIds, state, onState, onError }: {
  publisherIds: string[]; state: NewsState; onState: (state: NewsState) => void; onError: (message: string) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const publishers = publisherIds.flatMap((id) => {
    const publisher = state.publishers.find((entry) => entry.id === id);
    return publisher ? [publisher] : [];
  });
  if (!publishers.length) return null;
  return <section className="news-discover-card" aria-label="发现更多来源">
    <header><h3>发现更多来源</h3><p>根据您的关注与浏览习惯推荐</p></header>
    <div>{publishers.map((publisher) => {
      const followed = state.enabledPublisherIds.includes(publisher.id);
      return <article key={publisher.id}>
        <span className="news-source-monogram" aria-hidden="true">{publisher.name.slice(0, 1).toUpperCase()}</span>
        <h4>{publisher.name}</h4><p>{publisher.category}</p>
        <button type="button" className={`button ${followed ? '' : 'button-primary'}`} disabled={Boolean(pending) || followed}
          onClick={async () => {
            setPending(publisher.id);
            try { onState(await browserClient.command('news.setPublisher', { id: publisher.id, enabled: true })); }
            catch (error) { onError(error instanceof Error ? error.message : String(error)); }
            finally { setPending(null); }
          }}>{followed ? <Check size={14} /> : <Plus size={14} />}{pending === publisher.id ? '关注中…' : followed ? '已关注' : '关注'}</button>
      </article>;
    })}</div>
  </section>;
}
