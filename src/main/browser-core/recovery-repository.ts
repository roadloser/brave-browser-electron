import type { StorageHost } from '../../shared/runtime-ports';
import { BrowserError } from '../../shared/errors';
import type { SavedWindow } from './core-state';

export class RecoveryRepository {
  constructor(private readonly storage: StorageHost) {}

  read(profileId: string): SavedWindow[] {
    const database = this.database(profileId);
    const row = database.get<{ payload: string }>('SELECT payload FROM core_recovery WHERE id = 1');
    if (!row) return [];
    try {
      const parsed: unknown = JSON.parse(row.payload);
      if (!Array.isArray(parsed)) throw new Error('Invalid recovery');
      return parsed.filter((value): value is SavedWindow =>
        !!value && typeof value === 'object' && value.profileId === profileId &&
        typeof value.id === 'string' && Array.isArray(value.tabs) &&
        value.tabs.every((tab: SavedWindow['tabs'][number]) => tab && typeof tab.id === 'string' && typeof tab.url === 'string') &&
        value.layout && value.bounds);
    } catch {
      throw new BrowserError('STORAGE_FAILED', '窗口恢复记录损坏，原始记录已保留', true);
    }
  }

  write(profileId: string, windows: SavedWindow[]): void {
    const database = this.database(profileId);
    database.transaction(() => database.run(
      'INSERT INTO core_recovery (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
      [JSON.stringify(windows), Date.now()],
    ));
  }

  private database(profileId: string) {
    const database = this.storage.open(profileId);
    database.exec('CREATE TABLE IF NOT EXISTS core_recovery (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    return database;
  }
}
