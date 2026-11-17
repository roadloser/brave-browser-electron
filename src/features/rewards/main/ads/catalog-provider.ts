import { z } from 'zod';
import type { AdsFetch } from './ads-fetch';
import { adsJson } from './ads-fetch';
import { parseCatalog, parseIssuers } from './catalog-schema';

export async function fetchAdsResources(fetch: AdsFetch, signal: AbortSignal) {
  const [catalog, issuers, geography] = await Promise.all([
    fetch('https://static.ads.brave.com/v9/catalog', { signal }).then(response => adsJson(response, 20 * 1024 * 1024)).then(value => parseCatalog(value)),
    fetch('https://static.ads.brave.com/v3/issuers', { signal }).then(response => adsJson(response)).then(value => parseIssuers(value)),
    fetch('https://geo.ads.brave.com/v1/getstate', { signal }).then(response => adsJson(response)).then(value => z.object({ country: z.string().regex(/^[A-Z]{2}$/), region: z.string().min(1).max(32) }).parse(value)),
  ]);
  return { catalog, issuers, country: geography.country, subdivision: `${geography.country}-${geography.region}` };
}
