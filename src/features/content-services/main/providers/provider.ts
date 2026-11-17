import type { DirectNewsFeed, NewsArticle, NewsPublisher } from '../../../../shared/contracts/content-services';

export type ScopedPublisher = NewsPublisher & { defaultEnabled: boolean; locales: { locale: string; channels: string[] }[] };
export type ScoredArticle = NewsArticle & { channels: string[]; score: number; popScore?: number };
export type NewsResult = { articles: ScoredArticle[]; etag?: string };
export type ContentFetch = (input: string, init?: RequestInit) => Promise<Response>;
export interface NewsProviderPort {
  readonly implementation: string;
  readonly version: string;
  catalog(signal: AbortSignal, fetch: ContentFetch): Promise<ScopedPublisher[]>;
  articles(locale: string, signal: AbortSignal, fetch: ContentFetch): Promise<NewsResult>;
}
export interface DirectFeedProviderPort {
  readonly implementation: string;
  read(url: string, id: string, signal: AbortSignal, fetch: ContentFetch): Promise<{ feed: DirectNewsFeed; articles: ScoredArticle[] }>;
}
