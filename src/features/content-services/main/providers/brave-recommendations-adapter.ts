import { z } from 'zod';
import type { ContentFetch } from './provider';
import type { NewsRecommendationsPort, SimilarityMatrix } from './topics-provider';
import { fetchText } from './fetch-text';

const matrixSchema = z.record(z.string(), z.array(z.object({ source: z.string(), score: z.number().finite() })));
export class BraveRecommendationsAdapter implements NewsRecommendationsPort {
  readonly implementation = 'brave-source-similarity-t10';
  async fetchSimilarities(locale: string, fetch: ContentFetch, signal: AbortSignal): Promise<SimilarityMatrix> {
    const url = `https://brave-today-cdn.brave.com/source-suggestions/source_similarity_t10.${locale.replace('-', '_')}.json`;
    const response = await fetchText(fetch, url, signal);
    const matrix = matrixSchema.parse(JSON.parse(response.text));
    return Object.fromEntries(Object.entries(matrix).map(([publisher, neighbors]) => [publisher, neighbors.map((entry) => ({
      publisherId: entry.source, score: entry.score,
    }))]));
  }
}
