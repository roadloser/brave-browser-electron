import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BrowserError } from '../../../../shared/errors';
import type { ContentFetch, NewsProviderPort, ScoredArticle, ScopedPublisher } from './provider';
import { fetchText } from './fetch-text';

const publisherSchema = z.object({
  publisher_id: z.string(), publisher_name: z.string(), site_url: z.string(), category: z.string().default(''),
  enabled: z.boolean().optional(), locales: z.array(z.object({ locale: z.string(), channels: z.array(z.string()) })).optional(),
});
const articleSchema = z.object({
  url: z.string(), title: z.string(), description: z.string().default(''),
  publisher_id: z.string(), publisher_name: z.string(), padded_img: z.string().optional(),
  publish_time: z.string(), content_type: z.string(), channels: z.array(z.string()).optional(),
  category: z.string().optional(), score: z.number().optional(), pop_score: z.number().optional(),
});

export class BraveNewsAdapter implements NewsProviderPort {
  readonly implementation = 'brave-news-cdn';
  readonly version = 'sources-global/combined-feed-v1';
  private readonly origin = 'https://brave-today-cdn.brave.com';

  async catalog(signal: AbortSignal, fetch: ContentFetch): Promise<ScopedPublisher[]> {
    const response = await fetchText(fetch, `${this.origin}/sources.global.json`, signal);
    const data: unknown = JSON.parse(response.text);
    if (!Array.isArray(data)) throw new BrowserError('UNAVAILABLE', '官方新闻来源格式已变更');
    const publishers: ScopedPublisher[] = [];
    for (const item of data) {
      const result = publisherSchema.safeParse(item);
      if (!result.success) continue;
      const source = result.data;
      let url: URL;
      try { url = new URL(source.site_url.includes('://') ? source.site_url : `https://${source.site_url}`); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol)) continue;
      publishers.push({
        id: source.publisher_id, name: source.publisher_name, url: url.href, category: source.category,
        defaultEnabled: source.enabled ?? true, locales: source.locales ?? [],
      });
    }
    if (!publishers.length && data.length) throw new BrowserError('UNAVAILABLE', '官方新闻来源无法映射，请更新适配器');
    return publishers;
  }

  async articles(locale: string, signal: AbortSignal, fetch: ContentFetch) {
    const nativeLocale = locale.replace('-', '_');
    const response = await fetchText(fetch, `${this.origin}/brave-today/feed.${nativeLocale}json`, signal, 16 * 1024 * 1024);
    const data: unknown = JSON.parse(response.text);
    if (!Array.isArray(data)) throw new BrowserError('UNAVAILABLE', '官方新闻内容格式已变更');
    const seen = new Set<string>();
    const articles: ScoredArticle[] = [];
    for (const item of data) {
      const result = articleSchema.safeParse(item);
      if (!result.success) continue;
      const source = result.data;
      if (!['article', 'product'].includes(source.content_type)) continue;
      let url: URL;
      try { url = new URL(source.url); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol) || seen.has(url.href)) continue;
      seen.add(url.href);
      const publishedAt = Date.parse(source.publish_time.includes('T') ? source.publish_time : source.publish_time.replace(' ', 'T') + 'Z');
      articles.push({
        id: createHash('sha256').update(url.href).digest('hex'), title: source.title, url: url.href,
        publisherId: source.publisher_id, publisherName: source.publisher_name, description: source.description,
        imageUrl: source.padded_img?.startsWith('https://') ? source.padded_img : undefined,
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
        channels: source.channels ?? (source.category ? [source.category] : []),
        score: source.score ?? 20,
        popScore: source.pop_score ?? 0,
      });
    }
    if (!articles.length && data.length) throw new BrowserError('UNAVAILABLE', '官方新闻内容无法映射，请更新适配器');
    return { articles, etag: response.etag };
  }
}
