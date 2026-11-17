import type { NewsDocument } from './news-repository';
import { BraveFeedAdapter } from './providers/brave-feed-adapter';
import type { NewsFeedPort } from './providers/news-feed-provider';

const feedAdapter: NewsFeedPort = new BraveFeedAdapter();
export function selectArticles(document: NewsDocument, recentUrls: string[] = []) {
  const result = feedAdapter.generate({
    articles: document.candidates, publishers: document.catalog, subscriptions: document.state, recentUrls, now: Date.now(),
    topics: document.topics, similarities: document.similarities,
  });
  document.state.articles = result.articles;
  document.state.feed = result.feed;
}
