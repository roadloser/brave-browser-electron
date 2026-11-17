import type { NewsArticle, NewsFeedItem } from '../../../../shared/contracts/content-services';
import type { RankingInput } from './ranking-provider';
import type { NewsTopic, SimilarityMatrix } from './topics-provider';

export type FeedInput = RankingInput & { topics: NewsTopic[]; similarities: SimilarityMatrix };
export type GeneratedNewsFeed = { articles: NewsArticle[]; feed: NewsFeedItem[] };
export interface NewsFeedPort {
  readonly implementation: string;
  readonly version: string;
  generate(input: FeedInput): GeneratedNewsFeed;
}
