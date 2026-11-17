import { z } from 'zod';
import { idSchema, type TabSnapshot } from './browser-core';

export type NewsPublisher = { id: string; name: string; url: string; category?: string };
export type NewsChannel = { id: string; name: string; enabled: boolean };
export type NewsArticle = {
  id: string; title: string; url: string; publisherId: string; publisherName: string;
  description: string; imageUrl?: string; publishedAt: number;
};
export type DirectNewsFeed = { id: string; title: string; url: string; siteUrl?: string; error?: string };
export type NewsFeedElement = { kind: 'hero' | 'article'; articleId: string; discover: boolean };
export type NewsFeedItem =
  | { id: string; kind: 'hero' | 'article'; articleId: string; discover: boolean }
  | { id: string; kind: 'cluster'; clusterType: 'channel' | 'topic'; title: string; elements: NewsFeedElement[] }
  | { id: string; kind: 'discover'; publisherIds: string[] };
export type NewsState = {
  enabled: boolean; locale: string; publishers: NewsPublisher[];
  enabledPublisherIds: string[]; disabledPublisherIds: string[];
  channels: NewsChannel[]; directFeeds: DirectNewsFeed[]; articles: NewsArticle[];
  lastUpdated: number | null; status: 'idle' | 'loading' | 'ready' | 'failed' | 'cancelled';
  error?: string; revision: number;
  feed: NewsFeedItem[];
  topicsStatus?: 'idle' | 'ready' | 'failed'; topicsError?: string; recommendationsError?: string;
};
export const contentServicesCommandSchemas = {
  'news.get': z.object({}),
  'news.resetPublisher': z.object({ id: idSchema }),
  'news.image': z.object({ articleId: idSchema }),
  'news.enable': z.object({ enabled: z.boolean() }),
  'news.refresh': z.object({}),
  'news.cancel': z.object({}),
  'news.setLocale': z.object({ locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/) }),
  'news.setPublisher': z.object({ id: idSchema, enabled: z.boolean() }),
  'news.setChannel': z.object({ id: idSchema, enabled: z.boolean() }),
  'news.addFeed': z.object({ url: z.string().url().max(2048) }),
  'news.removeFeed': z.object({ id: idSchema }),
  'talk.toggle': z.object({}),
  'talk.close': z.object({}),
};
export interface ContentServicesCommandResults {
  'news.get': NewsState;
  'news.resetPublisher': NewsState;
  'news.image': { dataUrl: string | null };
  'news.enable': NewsState;
  'news.refresh': NewsState;
  'news.cancel': NewsState;
  'news.setLocale': NewsState;
  'news.setPublisher': NewsState;
  'news.setChannel': NewsState;
  'news.addFeed': NewsState;
  'news.removeFeed': NewsState;
  'talk.toggle': TabSnapshot | null;
  'talk.close': void;
}
