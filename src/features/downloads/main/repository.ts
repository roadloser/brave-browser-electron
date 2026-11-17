import type { DownloadRecord } from '../../../shared/contracts/downloads';
import type { Migration, StorageHost } from '../../../shared/runtime-ports';

export const downloadMigrations: Migration[] = [{
  id: 'downloads.initial', version: 1, up: database => database.exec('CREATE TABLE downloads (id TEXT PRIMARY KEY, payload TEXT NOT NULL, started_at INTEGER NOT NULL)'),
}];
export class DownloadRepository {
  constructor(private readonly storage: StorageHost) {}
  list(profileId: string): DownloadRecord[] {
    return this.storage.open(profileId).all<{ payload: string }>('SELECT payload FROM downloads ORDER BY started_at DESC').map(row => JSON.parse(row.payload) as DownloadRecord);
  }
  put(profileId: string, record: DownloadRecord): void {
    this.storage.open(profileId).run('INSERT INTO downloads (id, payload, started_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', [record.id, JSON.stringify(record), record.startedAt]);
  }
  remove(profileId: string, id: string): void { this.storage.open(profileId).run('DELETE FROM downloads WHERE id=?', [id]); }
}
