import type { ContentFetch, ScopedPublisher } from './providers/provider';
import type { NewsDocument } from './news-repository';
import type { NewsRecommendationsPort, NewsTopicsPort } from './providers/topics-provider';
import { BraveTopicsAdapter } from './providers/brave-topics-adapter';
import { BraveRecommendationsAdapter } from './providers/brave-recommendations-adapter';

export class NewsEnrichment {
  private readonly topics: NewsTopicsPort = new BraveTopicsAdapter();
  private readonly recommendations: NewsRecommendationsPort = new BraveRecommendationsAdapter();
  async load(locale: string, publishers: ScopedPublisher[], prior: NewsDocument, fetch: ContentFetch, signal: AbortSignal) {
    const sameLocale = prior.enrichmentLocale === locale;
    const [topics, recommendations] = await Promise.all([
      this.topics.fetchTopics(locale, publishers, fetch, signal)
        .then((data) => ({ data, error: undefined as string | undefined }))
        .catch((error) => ({ data: sameLocale ? prior.topics : [], error: error instanceof Error ? error.message : '话题加载失败' })),
      this.recommendations.fetchSimilarities(locale, fetch, signal)
        .then((data) => ({ data, error: undefined as string | undefined }))
        .catch((error) => ({ data: sameLocale ? prior.similarities : {}, error: error instanceof Error ? error.message : '来源推荐加载失败' })),
    ]);
    return { topics, recommendations, locale };
  }
}
