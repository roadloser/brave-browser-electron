import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import type { ContentFetch, DirectFeedProviderPort, ScoredArticle } from './provider';
import { fetchText } from './fetch-text';

export class RssFeedAdapter implements DirectFeedProviderPort {
  readonly implementation = 'rss-parser-3.13.0';
  private readonly parser = new Parser();
  async read(url: string, id: string, signal: AbortSignal, fetch: ContentFetch) {
    const response = await fetchText(fetch, url, signal, 5 * 1024 * 1024);
    const parsed = await this.parser.parseString(response.text);
    const title = parsed.title?.trim() || new URL(url).hostname;
    const seen = new Set<string>();
    const articles: ScoredArticle[] = [];
    for (const item of parsed.items) {
      if (!item.link || !item.title) continue;
      let target: URL;
      try { target = new URL(item.link, url); } catch { continue; }
      if (!['https:', 'http:'].includes(target.protocol) || seen.has(target.href)) continue;
      seen.add(target.href);
      const timestamp = Date.parse(item.isoDate || item.pubDate || '');
      articles.push({
        id: createHash('sha256').update(target.href).digest('hex'), title: item.title, url: target.href,
        publisherId: id, publisherName: title, description: item.contentSnippet || item.content || '',
        publishedAt: Number.isFinite(timestamp) ? timestamp : 0, channels: [], score: 20,
        imageUrl: item.enclosure?.type?.startsWith('image/') && item.enclosure.url?.startsWith('https:') ? item.enclosure.url : undefined,
      });
    }
    return { feed: { id, title, url, siteUrl: parsed.link }, articles };
  }
}
