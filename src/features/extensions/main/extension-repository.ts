import type { ExtensionRecord } from '../../../shared/contracts/extensions';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';

export type StoredExtension = ExtensionRecord & {
  source: 'directory' | 'web-store'; sourcePath?: string; hash: string; optionalGrants: string[];
};
export type PendingSwap = { currentPath: string; previousPath: string; candidatePath: string; oldRecord: StoredExtension | null };

export const extensionMigrations: readonly Migration[] = [{
  id: 'extensions.initial', version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE extensions (id TEXT PRIMARY KEY, record TEXT NOT NULL);
      CREATE TABLE extension_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
      INSERT INTO extension_state(id,revision) VALUES(1,0);
      CREATE TABLE extension_pending_swaps (path TEXT PRIMARY KEY, record TEXT NOT NULL);
    `);
  },
}];

export class ExtensionRepository {
  constructor(private readonly database: ProfileDatabase) {}
  list(): StoredExtension[] {
    return this.database.all<{ record: string }>('SELECT record FROM extensions ORDER BY id').map(row => JSON.parse(row.record) as StoredExtension);
  }
  get(id: string): StoredExtension | undefined {
    const row = this.database.get<{ record: string }>('SELECT record FROM extensions WHERE id=?', [id]);
    return row ? JSON.parse(row.record) as StoredExtension : undefined;
  }
  save(extension: StoredExtension): void {
    this.database.transaction(() => {
      this.database.run('INSERT INTO extensions(id,record) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', [extension.id, JSON.stringify(extension)]);
      this.bump();
    });
  }
  remove(id: string): void {
    this.database.transaction(() => { this.database.run('DELETE FROM extensions WHERE id=?', [id]); this.bump(); });
  }
  revision(): number { return this.database.get<{ revision: number }>('SELECT revision FROM extension_state WHERE id=1')?.revision ?? 0; }
  pendingSwaps(): PendingSwap[] {
    return this.database.all<{ record: string }>('SELECT record FROM extension_pending_swaps').map(row => JSON.parse(row.record) as PendingSwap);
  }
  beginSwap(swap: PendingSwap): void {
    this.database.run('INSERT INTO extension_pending_swaps(path,record) VALUES(?,?)', [swap.currentPath, JSON.stringify(swap)]);
  }
  finishSwap(path: string, extension?: StoredExtension): void {
    this.database.transaction(() => {
      if (extension) this.save(extension);
      this.database.run('DELETE FROM extension_pending_swaps WHERE path=?', [path]);
    });
  }
  private bump() { this.database.run('UPDATE extension_state SET revision=revision+1 WHERE id=1'); }
}
