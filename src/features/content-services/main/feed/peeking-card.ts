import type { RankingInput } from '../providers/ranking-provider';
import type { WeightedArticle } from './weighted-articles';
import type { NewsTopic } from '../providers/topics-provider';

export function pickPeeking(input: RankingInput, available: WeightedArticle[], topics: NewsTopic[]) {
  const enabled = new Set(input.subscriptions.enabledPublisherIds);
  const direct = new Set(input.subscriptions.directFeeds.map((feed) => feed.id));
  const channels = new Set(input.subscriptions.channels.filter((channel) => channel.enabled).map((channel) => channel.id));
  const topStories = new Set(topics.flatMap((topic) => topic.articles.map((article) => article.url)));
  const hour = new Date(input.now).getHours();
  const scored = available.flatMap((entry) => {
    const article = entry.article;
    let score = direct.has(article.publisherId) ? 15 : enabled.has(article.publisherId) ? 10 : article.channels.some((channel) => channels.has(channel)) ? 5 : 0;
    if (!score) return [];
    if (topStories.has(article.url)) score *= 1.2;
    const hours = (input.now - article.publishedAt) / 3600000;
    score *= hours <= 1 ? 1.5 : hours <= 3 ? 1.3 : hours <= 6 ? 1.2 : hours <= 24 ? 1.1 : Math.max(0.1, Math.pow(0.5, Math.floor(hours / 24) / 1.1));
    if (hour >= 6 && hour < 10 && article.channels.includes('Top News')) score += 3;
    else if (hour >= 17 && hour <= 22 && article.channels.includes('Entertainment')) score += 3;
    return [{ entry, score }];
  }).sort((left, right) => right.score - left.score || right.entry.article.publishedAt - left.entry.article.publishedAt);
  if (!scored.length) return undefined;
  const counts = new Map<string, number>();
  const candidates: WeightedArticle[] = [];
  for (const { entry, score } of scored) {
    if (candidates.length >= 10 || score < scored[0].score * 0.7) break;
    const publisher = entry.article.publisherId;
    if ((counts.get(publisher) ?? 0) >= 2) continue;
    counts.set(publisher, (counts.get(publisher) ?? 0) + 1); candidates.push(entry);
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}
