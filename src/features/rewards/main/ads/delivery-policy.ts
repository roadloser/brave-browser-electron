import { randomInt } from 'node:crypto';
import type { AdCreative, AdPlacement, AdsCatalog, AdsDeliverySettings } from './delivery-types';

const hour = 3_600_000;
const day = 24 * hour;
const random = () => randomInt(0, 0x1000000) / 0x1000000;

export function selectNotification(catalog: AdsCatalog, settings: AdsDeliverySettings, history: AdPlacement[], rotations: Map<number, Set<string>>, now = Date.now()): AdCreative | null {
  if (!settings.enabled || !settings.country || catalog.expiresAt <= now) return null;
  const viewed = history.filter(placement => placement.shownAt !== undefined);
  if (viewed.filter(placement => placement.shownAt! > now - hour).length >= settings.maxPerHour || viewed.filter(placement => placement.shownAt! > now - day).length >= 100) return null;
  const latest = Math.max(0, ...viewed.map(placement => placement.shownAt!));
  if (latest + hour / settings.maxPerHour > now) return null;
  const current = new Date(now); const minute = current.getHours() * 60 + current.getMinutes();
  const candidates = catalog.creatives.filter(creative => {
    if (creative.priority <= 0 || creative.startAt > now || creative.endAt <= now || !creative.segments.includes('untargeted')) return false;
    if (!creative.countries.some(country => country === settings.country || country === settings.subdivision)) return false;
    if (creative.platforms.length && !creative.platforms.includes('macos')) return false;
    if (creative.dayparts.length && !creative.dayparts.some(part => part.days.includes(String(current.getDay())) && minute >= part.startMinute && minute <= part.endMinute)) return false;
    const setHistory = viewed.filter(placement => placement.creative.creativeSetId === creative.creativeSetId);
    const campaignHistory = viewed.filter(placement => placement.creative.campaignId === creative.campaignId);
    const caps = creative.caps;
    return (caps.campaignDaily === 0 || campaignHistory.filter(placement => placement.shownAt! > now - day).length < caps.campaignDaily)
      && (caps.daily === 0 || setHistory.filter(placement => placement.shownAt! > now - day).length < caps.daily)
      && (caps.weekly === 0 || setHistory.filter(placement => placement.shownAt! > now - 7 * day).length < caps.weekly)
      && (caps.monthly === 0 || setHistory.filter(placement => placement.shownAt! > now - 30 * day).length < caps.monthly)
      && (caps.total === 0 || setHistory.length < caps.total) && random() < creative.passThroughRate;
  });
  if (!candidates.length) return null;
  const priority = Math.min(...candidates.map(creative => creative.priority));
  let pool = candidates.filter(creative => creative.priority === priority);
  const served = rotations.get(priority) ?? new Set<string>();
  if (pool.every(creative => served.has(creative.id))) served.clear();
  rotations.set(priority, served);
  pool = pool.filter(creative => !served.has(creative.id));
  return pool[randomInt(pool.length)];
}
