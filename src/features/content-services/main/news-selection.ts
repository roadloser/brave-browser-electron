import type { NewsDocument } from './news-repository';

export function selectArticles(document: NewsDocument) {
  const enabled = new Set(document.state.enabledPublisherIds);
  const disabled = new Set(document.state.disabledPublisherIds);
  const channels = new Set(document.state.channels.filter((channel) => channel.enabled).map((channel) => channel.id));
  const direct = new Set(document.state.directFeeds.map((feed) => feed.id));
  const seen = new Set<string>();
  document.state.articles = document.candidates.filter((article) => {
    if (seen.has(article.url) || disabled.has(article.publisherId)) return false;
    const included = direct.has(article.publisherId) || enabled.has(article.publisherId) || article.channels.some((channel) => channels.has(channel));
    if (included) seen.add(article.url);
    return included;
  }).sort((left, right) => right.score - left.score || right.publishedAt - left.publishedAt)
    .map(({ channels: _channels, score: _score, ...article }) => article);
}
