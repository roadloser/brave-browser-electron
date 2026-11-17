import { randomUUID } from 'node:crypto';
import type { CredentialSummary } from '../../../shared/contracts/credentials';
import type { Migration, StorageHost } from '../../../shared/runtime-ports';

export type StoredCredential = CredentialSummary & { encryptedPassword: string; encryptedSyncMetadata?: string };
export const credentialMigrations: Migration[] = [{
  id: 'credentials.initial', version: 1, up: database => database.exec('CREATE TABLE credentials (id TEXT PRIMARY KEY, origin TEXT NOT NULL, username TEXT NOT NULL, encrypted_password TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(origin, username))'),
}];
credentialMigrations.push({ id: 'credentials.sync-metadata', version: 1, up: database => database.exec('ALTER TABLE credentials ADD COLUMN encrypted_sync_metadata TEXT') });
export class CredentialRepository {
  constructor(private readonly storage: StorageHost) {}
  list(profileId: string): StoredCredential[] {
    return this.storage.open(profileId).all<{ id: string; origin: string; username: string; encrypted_password: string; encrypted_sync_metadata: string | null; created_at: number; updated_at: number }>('SELECT * FROM credentials ORDER BY origin,username')
      .map(row => ({ id: row.id, origin: row.origin, username: row.username, encryptedPassword: row.encrypted_password, encryptedSyncMetadata: row.encrypted_sync_metadata ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at }));
  }
  save(profileId: string, origin: string, username: string, encryptedPassword: string): void {
    const now = Date.now();
    this.storage.open(profileId).transaction(() => this.storage.open(profileId).run('INSERT INTO credentials(id,origin,username,encrypted_password,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(origin,username) DO UPDATE SET encrypted_password=excluded.encrypted_password,updated_at=excluded.updated_at',
      [randomUUID(), origin, username, encryptedPassword, now, now]));
  }
  remove(profileId: string, id: string): void { this.storage.open(profileId).run('DELETE FROM credentials WHERE id=?', [id]); }
}
