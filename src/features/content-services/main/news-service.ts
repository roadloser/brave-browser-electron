import { createHash } from 'node:crypto';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import type { NewsState } from '../../../shared/contracts/content-services';
import { BrowserError } from '../../../shared/errors';
import { NewsRepository, defaultNewsDocument, type NewsDocument } from './news-repository';
import type { DirectFeedProviderPort, NewsProviderPort } from './providers/provider';
import { BraveNewsAdapter } from './providers/brave-news-adapter';
import { RssFeedAdapter } from './providers/rss-feed-adapter';
import { selectArticles } from './news-selection';
import { NewsEnrichment } from './news-enrichment';

export class NewsService {
  private readonly documents = new Map<string, NewsDocument>();
  private readonly operations = new Map<string, AbortController>();
  private readonly feedOperations = new Map<string, Set<AbortController>>();
  private readonly provider: NewsProviderPort = new BraveNewsAdapter();
  private readonly direct: DirectFeedProviderPort = new RssFeedAdapter();
  private readonly enrichment = new NewsEnrichment();
  private readonly release: () => void;
  constructor(private readonly runtime: FeatureRuntime) {
    this.release = runtime.core.onEvent((event) => {
      if (event.type !== 'contextDisposed') return;
      const key = this.key(event.context);
      this.operations.get(key)?.abort(); this.operations.delete(key); this.documents.delete(key);
      this.feedOperations.get(key)?.forEach((operation) => operation.abort()); this.feedOperations.delete(key);
    });
  }
  get(context: CommandContext) { return structuredClone(this.load(context).state); }
  enable(context: CommandContext, enabled: boolean) {
    if (!enabled) this.cancel(context);
    return this.commit(context, (document) => { document.state.enabled = enabled; });
  }
  setLocale(context: CommandContext, locale: string) {
    this.cancel(context);
    return this.commit(context, (document) => {
      document.state.locale = locale; document.state.lastUpdated = null;
      document.state.channels = [];
      document.topics = []; document.similarities = {}; document.enrichmentLocale = undefined;
      document.state.topicsStatus = 'idle'; document.state.topicsError = undefined; document.state.recommendationsError = undefined;
    });
  }
  setPublisher(context: CommandContext, id: string, enabled: boolean) {
    return this.commit(context, (document) => {
      if (!document.state.publishers.some((publisher) => publisher.id === id)) throw new BrowserError('NOT_FOUND', '新闻来源已不存在');
      document.state.enabledPublisherIds = document.state.enabledPublisherIds.filter((entry) => entry !== id);
      document.state.disabledPublisherIds = document.state.disabledPublisherIds.filter((entry) => entry !== id);
      (enabled ? document.state.enabledPublisherIds : document.state.disabledPublisherIds).push(id);
      selectArticles(document, this.recentUrls(context));
    });
  }
  setChannel(context: CommandContext, id: string, enabled: boolean) {
    return this.commit(context, (document) => {
      const channel = document.state.channels.find((entry) => entry.id === id);
      if (!channel) throw new BrowserError('NOT_FOUND', '新闻频道已不存在');
      channel.enabled = enabled; selectArticles(document, this.recentUrls(context));
    });
  }
  cancel(context: CommandContext) {
    const key = this.key(context);
    this.operations.get(key)?.abort(); this.operations.delete(key);
    this.feedOperations.get(key)?.forEach((operation) => operation.abort()); this.feedOperations.delete(key);
    return this.commit(context, (document) => {
      if (document.state.status === 'loading') { document.state.status = 'cancelled'; document.state.error = undefined; }
    });
  }
  async refresh(context: CommandContext): Promise<NewsState> {
    const key = this.key(context);
    const prior = this.load(context);
    if (!prior.state.enabled) throw new BrowserError('FORBIDDEN', '请先启用 Brave News');
    if (this.operations.has(key)) return this.get(context);
    const controller = new AbortController();
    this.operations.set(key, controller);
    this.commit(context, (document) => { document.state.status = 'loading'; document.state.error = undefined; });
    const timeout = setTimeout(() => controller.abort(), 30000);
    const fetch = (url: string, init?: RequestInit) => this.runtime.network.fetch(context, url, { ...init, purpose: 'news' });
    try {
      const catalogResult = await this.provider.catalog(controller.signal, fetch).then((catalog) => ({ catalog, error: '' }))
        .catch((error) => ({ catalog: prior.catalog, error: error instanceof Error ? error.message : '新闻来源下载失败' }));
      const locale = prior.state.locale.replace('-', '_');
      const enrichmentPromise = this.enrichment.load(locale, catalogResult.catalog, prior, fetch, controller.signal);
      const locales = new Set([locale]);
      for (const publisher of catalogResult.catalog) {
        if (!prior.state.enabledPublisherIds.includes(publisher.id) || publisher.locales.some((entry) => locales.has(entry.locale))) continue;
        if (publisher.locales[0]) locales.add(publisher.locales[0].locale);
      }
      const combined = await Promise.all([...locales].map(async (entry) => {
        try { return { articles: (await this.provider.articles(entry, controller.signal, fetch)).articles, error: '' }; }
        catch (error) { return { articles: [], error: error instanceof Error ? error.message : '新闻下载失败' }; }
      }));
      const direct = await Promise.all(prior.state.directFeeds.map(async (feed) => {
        try { return { ...(await this.direct.read(feed.url, feed.id, controller.signal, fetch)), error: '' }; }
        catch (error) { return { feed, articles: [], error: error instanceof Error ? error.message : '订阅源读取失败' }; }
      }));
      const enrichment = await enrichmentPromise;
      if (!this.documents.has(key)) throw new BrowserError('CANCELLED', '资料上下文已关闭');
      if (controller.signal.aborted || this.operations.get(key) !== controller) return this.get(context);
      const anySuccess = combined.some((result) => !result.error) || direct.some((result) => !result.error);
      const errors = [catalogResult.error, ...combined.map((result) => result.error), ...direct.map((result) => result.error)].filter(Boolean);
      return this.commit(context, (document) => {
        document.catalog = catalogResult.catalog;
        document.topics = enrichment.topics.data;
        document.similarities = enrichment.recommendations.data;
        document.enrichmentLocale = enrichment.locale;
        document.state.topicsStatus = enrichment.topics.error ? 'failed' : 'ready';
        document.state.topicsError = enrichment.topics.error;
        document.state.recommendationsError = enrichment.recommendations.error;
        document.state.publishers = catalogResult.catalog.map(({ defaultEnabled: _default, locales: _locales, ...publisher }) => publisher);
        const selected = new Map(document.state.channels.map((channel) => [channel.id, channel.enabled]));
        const channels = [...new Set(catalogResult.catalog.flatMap((publisher) => publisher.locales.filter((entry) => entry.locale === locale).flatMap((entry) => entry.channels)))];
        document.state.channels = channels.map((name) => ({ id: name, name, enabled: selected.get(name) ?? true }));
        document.state.directFeeds = direct.map((result) => ({ ...result.feed, error: result.error || undefined }));
        if (anySuccess) {
          const directIds = new Set(document.state.directFeeds.map((feed) => feed.id));
          const combinedArticles = combined.flatMap((result) => result.articles);
          const retainedCombined = combined.some((result) => result.error) ? document.candidates.filter((article) => !directIds.has(article.publisherId)) : [];
          const retainedDirect = direct.filter((result) => result.error).flatMap((result) => document.candidates.filter((article) => article.publisherId === result.feed.id));
          document.candidates = [...combinedArticles, ...retainedCombined, ...direct.flatMap((result) => result.articles), ...retainedDirect];
          selectArticles(document, this.recentUrls(context));
          document.state.lastUpdated = Date.now();
        }
        document.state.status = anySuccess ? 'ready' : 'failed';
        document.state.error = errors.length ? `部分新闻来源未更新，已保留可用缓存：${[...new Set(errors)].join('；')}` : undefined;
      });
    } finally {
      clearTimeout(timeout);
      if (this.operations.get(key) === controller) {
        this.operations.delete(key);
        if (controller.signal.aborted && this.documents.has(key)) this.commit(context, (document) => {
          document.state.status = 'cancelled'; document.state.error = '新闻刷新已取消或超时，保留旧缓存';
        });
      }
    }
  }
  async addFeed(context: CommandContext, url: string) {
    const normalized = new URL(url).href;
    if (!['http:', 'https:'].includes(new URL(normalized).protocol)) throw new BrowserError('INVALID_ARGUMENT', '订阅源必须是 HTTP 或 HTTPS');
    const id = `rss-${createHash('sha256').update(normalized).digest('hex').slice(0, 32)}`;
    const controller = new AbortController();
    const contextKey = this.key(context);
    const pending = this.feedOperations.get(contextKey) ?? new Set<AbortController>();
    pending.add(controller); this.feedOperations.set(contextKey, pending);
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const result = await this.direct.read(normalized, id, controller.signal, (url, init) => this.runtime.network.fetch(context, url, { ...init, purpose: 'news' }));
      if (controller.signal.aborted) throw new BrowserError('CANCELLED', '添加订阅已取消');
      return this.commit(context, (document) => {
        document.state.directFeeds = [...document.state.directFeeds.filter((feed) => feed.id !== id), result.feed];
        document.candidates = [...document.candidates.filter((article) => article.publisherId !== id), ...result.articles];
        selectArticles(document, this.recentUrls(context));
      });
    } finally {
      clearTimeout(timeout); pending.delete(controller);
      if (!pending.size) this.feedOperations.delete(contextKey);
    }
  }
  removeFeed(context: CommandContext, id: string) {
    this.cancel(context);
    return this.commit(context, (document) => {
      document.state.directFeeds = document.state.directFeeds.filter((feed) => feed.id !== id);
      document.candidates = document.candidates.filter((article) => article.publisherId !== id); selectArticles(document, this.recentUrls(context));
    });
  }
  dispose() {
    this.release(); this.operations.forEach((operation) => operation.abort());
    this.feedOperations.forEach((pending) => pending.forEach((operation) => operation.abort()));
    this.feedOperations.clear();
    this.operations.clear(); this.documents.clear();
  }
  private key(context: BrowserContext) { return context.isPrivate ? `private:${context.contextId}` : `profile:${context.profileId}`; }
  private recentUrls(context: BrowserContext) {
    return this.runtime.historyRead.recentUrls(context, { since: Date.now() - 14 * 24 * 60 * 60 * 1000, limit: 2000 });
  }
  private load(context: CommandContext) {
    const key = this.key(context);
    const existing = this.documents.get(key);
    if (existing) return existing;
    const document = context.isPrivate ? defaultNewsDocument() : new NewsRepository(this.runtime.storage.open(context.profileId)).read();
    this.documents.set(key, document); return document;
  }
  private commit(context: CommandContext, update: (document: NewsDocument) => void) {
    const document = structuredClone(this.load(context));
    update(document); document.state.revision++;
    if (!context.isPrivate) new NewsRepository(this.runtime.storage.open(context.profileId)).write(document);
    this.documents.set(this.key(context), document);
    const state = structuredClone(document.state);
    this.runtime.publish('news.changed', state, context.isPrivate ? { contextId: context.contextId } : { profileId: context.profileId });
    return state;
  }
}
