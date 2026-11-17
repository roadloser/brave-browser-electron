import { randomUUID } from 'node:crypto';
import type { NewsFeedItem } from '../../../../shared/contracts/content-services';
import type { FeedInput, NewsFeedPort } from './news-feed-provider';
import { ArticlePool } from '../feed/article-pool';
import { suggestedPublishers } from '../feed/suggested-publishers';

export class BraveFeedAdapter implements NewsFeedPort {
  readonly implementation = 'brave-news-feed-v2';
  readonly version = 'peeking/top-news/standard-cluster-discover';
  generate(input: FeedInput) {
    const pool = new ArticlePool(input);
    const feed: NewsFeedItem[] = [];
    const suggestions = suggestedPublishers(input, input.similarities);
    const topics = input.topics.filter((topic) => topic.articles.length);
    let topicIndex = 0;
    let suggestionIndex = 0;
    const addBlock = (block: ReturnType<ArticlePool['block']>) => {
      for (const element of block) feed.push({ id: randomUUID(), ...element });
    };
    const addChannel = (channel: string) => {
      const elements = pool.block({ channel });
      if (elements.length) feed.push({ id: randomUUID(), kind: 'cluster', clusterType: 'channel', title: channel, elements });
    };
    const addTopic = () => {
      const topic = topics[topicIndex++];
      if (!topic) return;
      const elements = pool.topicArticles(topic.articles);
      if (elements.length) feed.push({ id: randomUUID(), kind: 'cluster', clusterType: 'topic', title: topic.title, elements });
    };
    if (!pool.groups().length || !pool.remaining.length) return { feed, articles: [] };
    addBlock(pool.block({ initial: true }));
    const topStories = topics.map((topic) => topic.articles[0]).filter(Boolean).slice(0, 5);
    if (topStories.length) {
      const elements = pool.topicArticles(topStories);
      if (elements.length) feed.push({ id: randomUUID(), kind: 'cluster', clusterType: 'topic', title: 'Top News', elements });
    } else addChannel('Top News');
    for (let iteration = 0; ; iteration++) {
      const step = iteration % 3;
      if (step === 0) {
        const block = pool.block();
        if (!block.length) break;
        addBlock(block);
      } else if (step === 1) {
        if (Math.random() < 0.5) addBlock(pool.block());
        else {
          const channels = pool.channels();
          if (channels.length && (Math.random() < 0.5 || topicIndex >= topics.length)) addChannel(channels[Math.floor(Math.random() * channels.length)]);
          else addTopic();
        }
      } else if (suggestionIndex < suggestions.length) {
        const publisherIds = suggestions.slice(suggestionIndex, suggestionIndex + 3);
        suggestionIndex += publisherIds.length;
        feed.push({ id: randomUUID(), kind: 'discover', publisherIds });
      }
    }
    return { feed, articles: [...pool.articles.values()] };
  }
}
