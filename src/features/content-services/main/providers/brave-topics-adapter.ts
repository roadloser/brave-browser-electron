import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BrowserError } from '../../../../shared/errors';
import type { ContentFetch, ScopedPublisher } from './provider';
import type { NewsTopicsPort, NewsTopic } from './topics-provider';
import { fetchText } from './fetch-text';

const topicSchema = z.object({ topic_index: z.number().int(), title: z.string(), claude_title_short: z.string() });
const topicArticleSchema = z.object({
  topic_index: z.number().int(), title: z.string(), description: z.string().optional(), url: z.string().url(),
  img: z.string().optional(), publisher_name: z.string(), publish_time: z.number(),
});
export class BraveTopicsAdapter implements NewsTopicsPort {
  readonly implementation = 'brave-news-topic-clustering';
  readonly version = 'topics-and-topics_news-v1';
  async fetchTopics(locale: string, publishers: ScopedPublisher[], fetch: ContentFetch, signal: AbortSignal): Promise<NewsTopic[]> {
    const origin = 'https://brave-today-cdn.brave.com/news-topic-clustering';
    const suffix = locale.replace('-', '_');
    const topicsResponse = await fetchText(fetch, `${origin}/topics.${suffix}.json`, signal);
    const articleResponse = await fetchText(fetch, `${origin}/topics_news.${suffix}.json`, signal);
    const rawTopics: unknown = JSON.parse(topicsResponse.text);
    const rawArticles: unknown = JSON.parse(articleResponse.text);
    if (!Array.isArray(rawTopics) || !Array.isArray(rawArticles)) throw new BrowserError('UNAVAILABLE', '官方话题资源格式无效，保留上次话题');
    const articles = rawArticles.flatMap((raw) => {
      const result = topicArticleSchema.safeParse(raw);
      if (!result.success || !/^https?:/.test(result.data.url)) return [];
      return [result.data];
    });
    if (rawArticles.length && !articles.length) throw new BrowserError('UNAVAILABLE', '官方话题文章字段发生变化，保留上次话题');
    const topics: NewsTopic[] = [];
    let validTopics = 0;
    for (const raw of rawTopics) {
      const result = topicSchema.safeParse(raw);
      if (!result.success) continue;
      validTopics++;
      const topic = result.data;
      const mapped = articles.filter((article) => article.topic_index === topic.topic_index).map((article) => ({
        id: createHash('sha256').update(article.url).digest('hex'),
        title: article.title, url: article.url, description: article.description ?? '',
        publisherId: publishers.find((publisher) => publisher.name === article.publisher_name)?.id ?? '',
        publisherName: article.publisher_name,
        imageUrl: article.img?.startsWith('https://') ? article.img : undefined,
        publishedAt: Date.now(),
      }));
      if (mapped.length) topics.push({ id: String(topic.topic_index), title: topic.claude_title_short || topic.title, articles: mapped });
    }
    if (rawTopics.length && !validTopics) throw new BrowserError('UNAVAILABLE', '官方话题字段发生变化，保留上次话题');
    return topics;
  }
}
