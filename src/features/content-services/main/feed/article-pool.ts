import type { NewsArticle, NewsFeedElement } from '../../../../shared/contracts/content-services';
import type { FeedInput } from '../providers/news-feed-provider';
import type { WeightedArticle } from './weighted-articles';
import { normalInlineCount, roulette, weightedArticles } from './weighted-articles';
import { pickPeeking } from './peeking-card';

export class ArticlePool {
  readonly remaining: WeightedArticle[];
  readonly articles = new Map<string, NewsArticle>();
  private readonly followedChannels: Set<string>;
  private readonly followedPublishers: Set<string>;

  constructor(readonly input: FeedInput) {
    this.remaining = weightedArticles(input);
    this.followedChannels = new Set(input.subscriptions.channels.filter((channel) => channel.enabled).map((channel) => channel.id));
    this.followedPublishers = new Set([...input.subscriptions.enabledPublisherIds, ...input.subscriptions.directFeeds.map((feed) => feed.id)]);
  }

  groups() {
    return [
      ...[...this.followedChannels].filter((id) => this.remaining.some((entry) => entry.channels.includes(id))).map((id) => ({ id, channel: true })),
      ...[...this.followedPublishers].filter((id) => this.remaining.some((entry) => entry.article.publisherId === id)).map((id) => ({ id, channel: false })),
    ];
  }
  channels() { return this.groups().filter((group) => group.channel).map((group) => group.id); }

  block(options: { initial?: boolean; channel?: string } = {}): NewsFeedElement[] {
    if (!this.remaining.length) return [];
    const groups = this.groups();
    if (!options.channel && !groups.length) return [];
    const fromGroup = (hero: boolean) => {
      if (options.channel) return roulette(this.remaining.filter((entry) => entry.channels.includes(options.channel!)));
      const currentGroups = this.groups();
      if (!currentGroups.length) return undefined;
      const group = currentGroups[Math.floor(Math.random() * currentGroups.length)];
      return roulette(this.remaining.filter((entry) => (!hero || entry.article.imageUrl) &&
        (group.channel ? entry.channels.includes(group.id) : entry.article.publisherId === group.id)));
    };
    const elements: NewsFeedElement[] = [];
    const hero = options.initial ? pickPeeking(this.input, this.remaining, this.input.topics) : fromGroup(true);
    if (hero) elements.push(this.consume(hero, 'hero', false));
    const count = normalInlineCount();
    for (let index = 0; index < count; index++) {
      const discovery = !options.channel && Math.random() < 0.1;
      const chosen = discovery ? roulette(this.remaining.filter((entry) => entry.discoverable && !entry.subscribed), true) : fromGroup(false);
      if (chosen) elements.push(this.consume(chosen, 'article', discovery));
    }
    return elements;
  }

  topicArticles(articles: NewsArticle[]): NewsFeedElement[] {
    const disabled = new Set(this.input.subscriptions.disabledPublisherIds);
    return articles.filter((article) => !article.publisherId || !disabled.has(article.publisherId)).slice(0, 5).map((article) => {
      this.articles.set(article.id, article);
      return { kind: 'article', articleId: article.id, discover: false };
    });
  }

  private consume(entry: WeightedArticle, kind: 'hero' | 'article', discover: boolean): NewsFeedElement {
    this.remaining.splice(this.remaining.indexOf(entry), 1);
    const { channels: _channels, score: _score, popScore: _popScore, ...article } = entry.article;
    this.articles.set(article.id, article);
    return { kind, articleId: article.id, discover };
  }
}
