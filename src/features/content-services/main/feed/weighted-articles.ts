import type { ScoredArticle } from '../providers/provider';
import type { RankingInput } from '../providers/ranking-provider';

export type WeightedArticle = { article: ScoredArticle; weight: number; popRecency: number; subscribed: boolean; discoverable: boolean; channels: string[] };
export function weightedArticles(input: RankingInput): WeightedArticle[] {
  const { subscriptions, now } = input;
  const enabled = new Set(subscriptions.enabledPublisherIds);
  const disabled = new Set(subscriptions.disabledPublisherIds);
  const direct = new Set(subscriptions.directFeeds.map((feed) => feed.id));
  const enabledChannels = new Set(subscriptions.channels.filter((channel) => channel.enabled).map((channel) => channel.id));
  const locale = subscriptions.locale.replace('-', '_');
  const publisherMap = new Map(input.publishers.map((publisher) => [publisher.id, publisher]));
  const channelMap = new Map(input.publishers.map((publisher) => [publisher.id, publisher.locales.find((entry) => entry.locale === locale)?.channels ?? []]));
  const visitsByHost = new Map<string, number>();
  for (const url of input.recentUrls) {
    try { const hostname = new URL(url).hostname; visitsByHost.set(hostname, (visitsByHost.get(hostname) ?? 0) + 1); } catch {}
  }
  const publisherVisits = new Map<string, number>();
  let totalPublisherVisits = 1;
  for (const publisher of input.publishers) {
    let visits = 0;
    try { visits = visitsByHost.get(new URL(publisher.url).hostname) ?? 0; } catch {}
    publisherVisits.set(publisher.id, visits); totalPublisherVisits += visits;
  }
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const candidates = input.articles.filter((article) => {
    if (seen.has(article.url) || disabled.has(article.publisherId) || (!publisherMap.has(article.publisherId) && !direct.has(article.publisherId))) return false;
    seen.add(article.url);
    counts.set(article.publisherId, (counts.get(article.publisherId) ?? 0) + 1);
    for (const channel of channelMap.get(article.publisherId) ?? []) counts.set(channel, (counts.get(channel) ?? 0) + 1);
    return true;
  });
  return candidates.map((article) => {
    const channels = channelMap.get(article.publisherId) ?? [];
    let subscribedWeight = enabled.has(article.publisherId) || direct.has(article.publisherId) ? 1 / (counts.get(article.publisherId) || 1) : 0;
    for (const channel of channels) if (enabledChannels.has(channel)) subscribedWeight += 1 / (counts.get(channel) || 1);
    const ageHours = Math.max(0, Math.floor((now - article.publishedAt) / 3600000));
    const popRecency = (ageHours < 5 ? 2 : 1) * (Math.min(article.popScore ?? 0, 100) / 100 + 0.5) * Math.pow(0.5, ageHours / 18);
    const visits = (publisherVisits.get(article.publisherId) ?? 0) / totalPublisherVisits;
    return { article, channels, subscribed: subscribedWeight !== 0, discoverable: !channels.includes('Politics'),
      popRecency, weight: (0.2 + visits * 0.8 + subscribedWeight) * popRecency };
  });
}
export function roulette(articles: WeightedArticle[], discovery = false) {
  const total = articles.reduce((sum, article) => sum + (discovery ? article.popRecency : article.weight), 0);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  let choice = Math.random() * total;
  for (const article of articles) {
    choice -= discovery ? article.popRecency : article.weight;
    if (choice <= 0) return article;
  }
  return articles.at(-1);
}
export function normalInlineCount() {
  for (;;) {
    const first = Math.random();
    const second = Math.random();
    if (first === 0 || second === 0) continue;
    const normal = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * 3.1415 * second) / 10 + 0.5;
    if (normal >= 0 && normal < 1) return 1 + Math.floor(5 * normal);
  }
}
