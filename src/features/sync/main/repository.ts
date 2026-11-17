import type { ProfileDatabase, Migration, StorageHost } from '../../../shared/runtime-ports';
import type { SyncState, SyncDataType, SyncConflict } from '../../../shared/contracts/sync';
import type { SyncLocalItem, SyncLocalType } from '../../../shared/sync-data-ports';
import type { SyncedEntity, SyncEntity } from './protocol/types';

export type SyncConfiguration = {
  endpoint: string; deviceName: string; deviceId: string; encryptedWords?: string; encryptedServiceKey?: string;
  enabledTypes: SyncDataType[]; status: SyncState['status']; officialStatus: SyncState['officialStatus'];
  lastSync: number | null; error?: string; revision: number;
};
export type JournalEntry = { type: SyncLocalType; id: string; item: SyncLocalItem | null; hash: string; queuedAt: number };
export type StoredConflict = SyncConflict & { local: SyncLocalItem | null; remote: SyncLocalItem | null; entity: SyncedEntity };

export const syncMigrations: Migration[] = [{
  id: 'sync.initial', version: 1, up(database) {
    database.exec(`
      CREATE TABLE sync_configuration (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
      CREATE TABLE sync_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE sync_entities (type TEXT NOT NULL, local_id TEXT NOT NULL, server_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(type,local_id));
      CREATE INDEX sync_entities_server ON sync_entities(server_id);
      CREATE TABLE sync_journal (type TEXT NOT NULL, local_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(type,local_id));
      CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    `);
  },
}];
export class SyncRepository {
  constructor(private readonly storage: StorageHost) {}
  database(profileId: string): ProfileDatabase { return this.storage.open(profileId); }
  configuration(profileId: string): SyncConfiguration | undefined {
    const row = this.database(profileId).get<{ payload: string }>('SELECT payload FROM sync_configuration WHERE id=1');
    return row ? JSON.parse(row.payload) as SyncConfiguration : undefined;
  }
  saveConfiguration(profileId: string, value: SyncConfiguration): void {
    this.database(profileId).run('INSERT INTO sync_configuration(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', [JSON.stringify(value)]);
  }
  metadata<Value>(profileId: string, key: string): Value | undefined {
    const row = this.database(profileId).get<{ value: string }>('SELECT value FROM sync_metadata WHERE key=?', [key]);
    return row ? JSON.parse(row.value, bytesReviver) as Value : undefined;
  }
  setMetadata(profileId: string, key: string, value: unknown): void {
    this.database(profileId).run('INSERT INTO sync_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, JSON.stringify(value)]);
  }
  entities(profileId: string): SyncedEntity[] {
    return this.database(profileId).all<{ payload: string }>('SELECT payload FROM sync_entities').map(row => JSON.parse(row.payload, bytesReviver) as SyncedEntity);
  }
  saveEntity(profileId: string, entity: SyncedEntity): void {
    this.database(profileId).run('INSERT INTO sync_entities(type,local_id,server_id,payload) VALUES(?,?,?,?) ON CONFLICT(type,local_id) DO UPDATE SET server_id=excluded.server_id,payload=excluded.payload',
      [entity.type, entity.localId, entity.serverId, JSON.stringify(entity)]);
  }
  journal(profileId: string): JournalEntry[] {
    return this.database(profileId).all<{ payload: string }>('SELECT payload FROM sync_journal ORDER BY rowid').map(row => JSON.parse(row.payload) as JournalEntry);
  }
  enqueue(profileId: string, entry: JournalEntry): void {
    this.database(profileId).run('INSERT INTO sync_journal(type,local_id,payload) VALUES(?,?,?) ON CONFLICT(type,local_id) DO UPDATE SET payload=excluded.payload', [entry.type, entry.id, JSON.stringify(entry)]);
  }
  dequeue(profileId: string, type: SyncLocalType, id: string): void { this.database(profileId).run('DELETE FROM sync_journal WHERE type=? AND local_id=?', [type, id]); }
  conflicts(profileId: string): StoredConflict[] {
    return this.database(profileId).all<{ payload: string }>('SELECT payload FROM sync_conflicts').map(row => JSON.parse(row.payload, bytesReviver) as StoredConflict);
  }
  saveConflict(profileId: string, conflict: StoredConflict): void {
    this.database(profileId).run('INSERT INTO sync_conflicts(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', [conflict.id, JSON.stringify(conflict)]);
  }
  removeConflict(profileId: string, id: string): void { this.database(profileId).run('DELETE FROM sync_conflicts WHERE id=?', [id]); }
  leave(profileId: string): void {
    this.database(profileId).transaction(() => {
      this.database(profileId).exec('DELETE FROM sync_metadata; DELETE FROM sync_entities; DELETE FROM sync_journal; DELETE FROM sync_conflicts; DELETE FROM sync_configuration;');
    });
  }
}
function bytesReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && 'type' in value && value.type === 'Buffer' && 'data' in value && Array.isArray(value.data)) return Buffer.from(value.data);
  return value;
}
