import { z } from 'zod';
import { originSchema } from './site-settings';

export type SiteDataState = {
  sites: { origin: string; cookieCount: number; storageBytes: number | null; lastSeen: number; permissionsCount: number }[];
  cookieScopes: { domain: string; hostOnly: boolean; count: number; partitioned: boolean }[];
  coverage: 'observed-origins'; limitations: string[]; revision: number;
};
export type CookieMetadata = {
  name: string; domain: string; path: string; hostOnly: boolean; secure: boolean;
  httpOnly: boolean; session: boolean; expirationDate?: number; sameSite: string; partitionKey?: string;
};
export type SiteDataDetails = {
  origin: string; cookies: CookieMetadata[];
  storageUsage: { storageType: string; usage: number }[];
  totalUsage: number | null; quota: number | null; limitations: string[];
};
export type SiteDataClearResult = {
  cleared: boolean; steps: { kind: 'cookies' | 'storage' | 'permissions'; status: 'cleared' | 'failed' | 'skipped'; error?: string }[];
  affectedCookieScope?: string[];
};
export const siteDataCommandSchemas = {
  'siteData.list': z.object({ query: z.string().max(2048).optional() }),
  'siteData.details': z.object({ origin: originSchema }),
  'siteData.clear': z.object({ origin: originSchema, cookies: z.boolean(), storage: z.boolean(), permissions: z.boolean(), confirmed: z.literal(true) }),
  'siteData.resetPermissions': z.object({ origin: originSchema, confirmed: z.literal(true) }),
};
export interface SiteDataCommandResults {
  'siteData.list': SiteDataState;
  'siteData.details': SiteDataDetails;
  'siteData.clear': SiteDataClearResult;
  'siteData.resetPermissions': SiteDataClearResult;
}
