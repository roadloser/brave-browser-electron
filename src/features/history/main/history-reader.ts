import type { HistoryReader } from '../../../shared/history-read-port';
import type { StorageHost } from '../../../shared/runtime-ports';

export function createHistoryReader(storage: StorageHost): HistoryReader {
  return {
    recentUrls(context, options) {
      if (context.isPrivate) return [];
      const limit = Math.max(1, Math.min(500, Math.floor(options.limit)));
      return storage.open(context.profileId).all<{ url: string }>(
        'SELECT url FROM history_visits WHERE visited_at>=? GROUP BY url ORDER BY MAX(visited_at) DESC LIMIT ?',
        [options.since, limit],
      ).map(row => row.url);
    },
  };
}
