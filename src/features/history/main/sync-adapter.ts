import { z } from 'zod';
import type { HistoryEntry } from '../../../shared/contracts/history';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncDataAdapter } from '../../../shared/sync-data-ports';
import { BrowserError } from '../../../shared/errors';
import { HistoryService } from './service';

const entrySchema = z.object({
  id: z.string().min(1).max(128), url: z.string().url().max(32768),
  title: z.string().max(8192), visitedAt: z.number().nonnegative(),
  visitCount: z.number().int().positive(),
});

export function createHistorySyncAdapter(runtime: FeatureRuntime, service: HistoryService): SyncDataAdapter {
  return {
    snapshot(profileId) {
      return runtime.storage.open(profileId).all<HistoryEntry>(`
        SELECT visits.id, visits.url, visits.title, visits.visited_at AS visitedAt,
          (SELECT COUNT(*) FROM history_visits related WHERE related.url=visits.url) AS visitCount
        FROM history_visits visits ORDER BY visited_at,id
      `).map(value => ({ type: 'history', id: value.id, value }));
    },
    apply(profileId, changes) {
      const database = runtime.storage.open(profileId);
      let changed = false;
      for (const change of changes) {
        if (change.operation === 'delete') {
          if (change.type === 'history') changed = database.run('DELETE FROM history_visits WHERE id=?', [change.id]).changes > 0 || changed;
          continue;
        }
        if (change.item.type !== 'history') continue;
        const entry = entrySchema.parse(change.item.value);
        if (entry.id !== change.item.id) throw new BrowserError('CONFLICT', '同步历史标识不一致');
        if (!['http:', 'https:'].includes(new URL(entry.url).protocol)) throw new BrowserError('CONFLICT', '同步历史包含不支持的地址');
        database.run(`
          INSERT INTO history_visits(id,navigation_key,url,title,visited_at,source) VALUES(?,?,?,?,?,'sync')
          ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=excluded.title,visited_at=excluded.visited_at
        `, [entry.id, `sync:${entry.id}`, entry.url, entry.title, entry.visitedAt]);
        changed = true;
      }
      if (changed) database.run('UPDATE history_state SET revision=revision+1 WHERE id=1');
    },
    notify(profileId) { service.notifyImported(profileId); },
    subscribe(listener) { return service.subscribeLocal(listener); },
  };
}
