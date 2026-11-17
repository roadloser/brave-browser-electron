import type { RankingInput } from '../providers/ranking-provider';
import type { SimilarityMatrix } from '../providers/topics-provider';

export function suggestedPublishers(input: RankingInput, similarities: SimilarityMatrix) {
  const visits = new Map<string, number>();
  for (const url of input.recentUrls) {
    try { const host = new URL(url).hostname; visits.set(host, (visits.get(host) ?? 0) + 1); } catch {}
  }
  const maximum = Math.max(1, ...visits.values());
  const enabled = new Set(input.subscriptions.enabledPublisherIds);
  const disabled = new Set(input.subscriptions.disabledPublisherIds);
  const locale = input.subscriptions.locale.replace('-', '_');
  const publishers = new Map(input.publishers.map((publisher) => [publisher.id, publisher]));
  const scores = new Map<string, number>();
  for (const publisher of input.publishers) {
    if (!publisher.locales.some((entry) => entry.locale === locale)) continue;
    let count = 0;
    try {
      const host = new URL(publisher.url).hostname;
      count = visits.get(host) ?? (!host.startsWith('www.') ? visits.get(`www.${host}`) : 0) ?? 0;
    } catch {}
    const visited = count ? 0.4 + (count / maximum) * 0.6 : 0;
    if (!enabled.has(publisher.id) && !disabled.has(publisher.id)) scores.set(publisher.id, (scores.get(publisher.id) ?? 0) + visited);
    if (!visited && !enabled.has(publisher.id)) continue;
    for (const similar of similarities[publisher.id] ?? []) {
      if (!publishers.has(similar.publisherId) || enabled.has(similar.publisherId) || disabled.has(similar.publisherId)) continue;
      const score = visited * similar.score * 0.3 + (enabled.has(publisher.id) ? similar.score * 0.4 : 0);
      scores.set(similar.publisherId, (scores.get(similar.publisherId) ?? 0) + score);
    }
  }
  return [...scores.entries()].filter(([, score]) => score > 0).sort(([, left], [, right]) => right - left).slice(0, 15).map(([id]) => id);
}
