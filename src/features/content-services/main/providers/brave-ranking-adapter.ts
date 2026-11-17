import type { ScoredArticle } from './provider';
import type { NewsRankingPort, RankingInput } from './ranking-provider';

type WeightedArticle = { article: ScoredArticle; weight: number; popRecency: number; subscribed: boolean; discoverable: boolean; channels: string[] };
export class BraveRankingAdapter implements NewsRankingPort {
  readonly implementation = 'brave-news-signal-roulette';
  readonly version = 'source-boost1/channel-boost1/pop-half18h/visit-floor0.2';

  rank(input: RankingInput) {
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
    const weighted: WeightedArticle[] = candidates.map((article) => {
      const channels = channelMap.get(article.publisherId) ?? [];
      let subscribedWeight = enabled.has(article.publisherId) || direct.has(article.publisherId) ? 1 / (counts.get(article.publisherId) || 1) : 0;
      for (const channel of channels) if (enabledChannels.has(channel)) subscribedWeight += 1 / (counts.get(channel) || 1);
      const ageHours = Math.max(0, Math.floor((now - article.publishedAt) / 3600000));
      const popRecency = (ageHours < 5 ? 2 : 1) * (Math.min(article.popScore ?? 0, 100) / 100 + 0.5) * Math.pow(0.5, ageHours / 18);
      const visits = (publisherVisits.get(article.publisherId) ?? 0) / totalPublisherVisits;
      return { article, channels, subscribed: subscribedWeight !== 0, discoverable: !channels.includes('Politics'),
        popRecency, weight: (0.2 + visits * 0.8 + subscribedWeight) * popRecency };
    });
    const output: ScoredArticle[] = [];
    while (weighted.some((entry) => entry.subscribed)) {
      const groups: Array<{ id: string; channel: boolean }> = [
        ...[...enabledChannels].filter((channel) => weighted.some((entry) => entry.channels.includes(channel))).map((id) => ({ id, channel: true })),
        ...[...new Set([...enabled, ...direct])].filter((publisher) => weighted.some((entry) => entry.article.publisherId === publisher)).map((id) => ({ id, channel: false })),
      ];
      if (!groups.length) break;
      const group = groups[Math.floor(Math.random() * groups.length)];
      const discovery = Math.random() < 0.1;
      const eligible = weighted.filter((entry) => discovery ? entry.discoverable && !entry.subscribed :
        group.channel ? entry.channels.includes(group.id) : entry.article.publisherId === group.id);
      const selected = this.roulette(eligible, discovery);
      if (!selected) {
        const fallback = this.roulette(weighted.filter((entry) => entry.subscribed), false);
        if (!fallback) break;
        output.push(fallback.article); weighted.splice(weighted.indexOf(fallback), 1);
      } else { output.push(selected.article); weighted.splice(weighted.indexOf(selected), 1); }
    }
    return output;
  }

  private roulette(articles: WeightedArticle[], discovery: boolean) {
    const total = articles.reduce((sum, article) => sum + (discovery ? article.popRecency : article.weight), 0);
    if (!Number.isFinite(total) || total <= 0) return undefined;
    let choice = Math.random() * total;
    for (const article of articles) {
      choice -= discovery ? article.popRecency : article.weight;
      if (choice <= 0) return article;
    }
    return articles.at(-1);
  }
}
