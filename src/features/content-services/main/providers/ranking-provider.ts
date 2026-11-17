import type { NewsState } from '../../../../shared/contracts/content-services';
import type { ScoredArticle, ScopedPublisher } from './provider';

export type RankingInput = {
  articles: ScoredArticle[]; publishers: ScopedPublisher[]; subscriptions: NewsState; recentUrls: string[]; now: number;
};
export interface NewsRankingPort {
  readonly implementation: string;
  readonly version: string;
  rank(input: RankingInput): ScoredArticle[];
}
