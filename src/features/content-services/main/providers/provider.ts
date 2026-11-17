import type { DirectNewsFeed, NewsArticle, NewsPublisher } from '../../../../shared/contracts/content-services';

export type ScopedPublisher = NewsPublisher & { defaultEnabled: boolean; locales: { locale: string; channels: string[] }[] };
export type ScoredArticle = NewsArticle & { channels: string[]; score: number };
export type NewsResult = { articles: ScoredArticle[]; etag?: string };
export interface NewsProviderPort {
  readonly implementation: string;
  readonly version: string;
  catalog(signal: AbortSignal): Promise<ScopedPublisher[]>;
  articles(locale: string, signal: AbortSignal): Promise<NewsResult>;
}
export interface DirectFeedProviderPort {
  readonly implementation: string;
  read(url: string, id: string, signal: AbortSignal): Promise<{ feed: DirectNewsFeed; articles: ScoredArticle[] }>;
}
