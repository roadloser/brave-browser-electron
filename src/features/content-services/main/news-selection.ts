import type { NewsDocument } from './news-repository';
import { BraveRankingAdapter } from './providers/brave-ranking-adapter';
import type { NewsRankingPort } from './providers/ranking-provider';

const ranking: NewsRankingPort = new BraveRankingAdapter();
export function selectArticles(document: NewsDocument, recentUrls: string[] = []) {
  document.state.articles = ranking.rank({
    articles: document.candidates, publishers: document.catalog, subscriptions: document.state, recentUrls, now: Date.now(),
  }).map(({ channels: _channels, score: _score, popScore: _popScore, ...article }) => article);
}
