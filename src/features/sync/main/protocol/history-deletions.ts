import type { SyncLocalItem, SyncLocalChange } from '../../../../shared/sync-data-ports';
import type { Specifics } from './types';
import { windowsMicros } from './data-mapping';

export function deletionSpecifics(item: Extract<SyncLocalItem, { type: 'history' }>): Specifics {
  const micros = (BigInt(Math.trunc(item.value.visitedAt)) * 1000n).toString();
  return { history_delete_directive: { global_id_directive: {
    global_id: [windowsMicros(item.value.visitedAt)], start_time_usec: micros, end_time_usec: micros,
  } } };
}
export function applyHistoryDirective(specifics: Specifics, snapshot: SyncLocalItem[]): SyncLocalChange[] {
  const directive = specifics.history_delete_directive;
  if (!directive) return [];
  const entries = snapshot.filter((item): item is Extract<SyncLocalItem, { type: 'history' }> => item.type === 'history');
  const global = directive.global_id_directive;
  const range = directive.time_range_directive;
  const url = directive.url_directive;
  if (range?.app_id || url?.app_id) return [];
  const matchingUrls = new Set(entries.filter(item => global?.global_id?.includes(windowsMicros(item.value.visitedAt))).map(item => item.value.url));
  return entries.filter(item => {
    const timestamp = BigInt(Math.trunc(item.value.visitedAt)) * 1000n;
    if (global?.start_time_usec && global.end_time_usec) return matchingUrls.has(item.value.url) && timestamp >= BigInt(global.start_time_usec) && timestamp <= BigInt(global.end_time_usec);
    if (range?.start_time_usec && range.end_time_usec) return timestamp >= BigInt(range.start_time_usec) && timestamp <= BigInt(range.end_time_usec);
    if (url?.url && url.end_time_usec) return item.value.url === url.url && timestamp <= BigInt(url.end_time_usec);
    return false;
  }).map(item => ({ operation: 'delete', type: 'history', id: item.id }));
}
