import type { NewsArticle } from '../../../../shared/contracts/content-services';
import type { ContentFetch, ScopedPublisher } from './provider';

export type NewsTopic = { id: string; title: string; articles: NewsArticle[] };
export type SimilarityMatrix = Record<string, Array<{ publisherId: string; score: number }>>;
export interface NewsTopicsPort {
  readonly implementation: string;
  readonly version: string;
  fetchTopics(locale: string, publishers: ScopedPublisher[], fetch: ContentFetch, signal: AbortSignal): Promise<NewsTopic[]>;
}
export interface NewsRecommendationsPort {
  readonly implementation: string;
  fetchSimilarities(locale: string, fetch: ContentFetch, signal: AbortSignal): Promise<SimilarityMatrix>;
}
