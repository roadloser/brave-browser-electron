import { z } from 'zod';
import type { AdCreative, AdsCatalog, AdsIssuers } from './delivery-types';
import { BrowserError } from '../../../../shared/errors';

const code = z.object({ code: z.string().min(1), name: z.string().min(1) });
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
const cap = z.number().int().nonnegative().default(0);
const creativeSchema = z.object({
  creativeInstanceId: z.string().uuid(),
  type: z.object({ code: z.string(), name: z.string(), platform: z.string(), version: z.number().int() }),
  payload: z.unknown(),
});
const creativeSetSchema = z.object({
  creativeSetId: z.string().uuid(), perDay: cap, perWeek: cap, perMonth: cap, totalMax: cap,
  value: decimal, segments: z.array(code).min(1), oses: z.array(code).default([]), creatives: z.array(creativeSchema),
});
const campaignSchema = z.object({
  campaignId: z.string().uuid(), advertiserId: z.string().uuid(), priority: z.number().int().default(1),
  ptr: z.number().min(0).max(1).default(1), startAt: z.string(), endAt: z.string(), dailyCap: cap,
  geoTargets: z.array(code).min(1),
  dayParts: z.array(z.object({ dow: z.string().regex(/^[0-7]+$/), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(0).max(1439) })).default([]),
  creativeSets: z.array(z.unknown()),
});
const payloadSchema = z.object({ title: z.string().min(1).max(256), body: z.string().min(1).max(2048), targetUrl: z.string().url().max(8192) });

export function parseCatalog(input: unknown, now = Date.now()): AdsCatalog {
  const root = z.object({ catalogId: z.string().min(1).max(256), version: z.literal(9), ping: z.number().int().positive().default(172_800_000), campaigns: z.array(z.unknown()).max(20_000) }).parse(input);
  const creatives: AdCreative[] = [];
  for (const value of root.campaigns) {
    const parsed = campaignSchema.safeParse(value);
    if (!parsed.success) continue;
    const campaign = parsed.data;
    const startAt = Date.parse(campaign.startAt); const endAt = Date.parse(campaign.endAt);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) continue;
    for (const setValue of campaign.creativeSets) {
      const parsedSet = creativeSetSchema.safeParse(setValue);
      if (!parsedSet.success) continue;
      const set = parsedSet.data;
      for (const creative of set.creatives) {
        if (creative.type.code !== 'notification_all_v1') continue;
        const parsedPayload = payloadSchema.safeParse(creative.payload);
        if (!parsedPayload.success) continue;
        const url = new URL(parsedPayload.data.targetUrl);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
        creatives.push({
          id: creative.creativeInstanceId, campaignId: campaign.campaignId, creativeSetId: set.creativeSetId,
          ...parsedPayload.data, startAt, endAt, priority: campaign.priority, passThroughRate: campaign.ptr, value: set.value,
          countries: campaign.geoTargets.map(target => target.code), segments: set.segments.map(segment => segment.code), platforms: set.oses.map(platform => platform.code),
          dayparts: campaign.dayParts.map(part => ({ days: part.dow, startMinute: part.startMinute, endMinute: part.endMinute })),
          caps: { campaignDaily: campaign.dailyCap, daily: set.perDay, weekly: set.perWeek, monthly: set.perMonth, total: set.totalMax },
        });
      }
    }
  }
  return { id: root.catalogId, version: 9, fetchedAt: now, expiresAt: now + root.ping, creatives };
}

export function parseIssuers(input: unknown, now = Date.now()): AdsIssuers {
  const root = z.object({ ping: z.number().int().positive(), issuers: z.array(z.object({ name: z.string(), publicKeys: z.array(z.object({ publicKey: z.string().min(1), associatedValue: decimal.optional() })) })) }).parse(input);
  const confirmations = root.issuers.filter(issuer => issuer.name === 'confirmations');
  const payments = root.issuers.filter(issuer => issuer.name === 'payments');
  if (confirmations.length !== 1 || payments.length !== 1) throw new BrowserError('UNAVAILABLE', '广告issuer列表不完整或重复');
  const keys = [...confirmations[0].publicKeys, ...payments[0].publicKeys];
  if (keys.some(key => Buffer.from(key.publicKey, 'base64').length !== 32) || payments[0].publicKeys.some(key => key.associatedValue === undefined)) throw new BrowserError('UNAVAILABLE', '广告issuer公钥或关联金额无效');
  return { fetchedAt: now, expiresAt: now + root.ping, confirmations: confirmations[0].publicKeys.map(key => key.publicKey), payments: Object.fromEntries(payments[0].publicKeys.map(key => [key.publicKey, key.associatedValue!])) };
}
