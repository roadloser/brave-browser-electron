import { BrowserError } from '../../../shared/errors';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';

export function runMigrations(database: ProfileDatabase, migrations: readonly Migration[]): void {
  database.exec('CREATE TABLE IF NOT EXISTS application_migrations (id TEXT PRIMARY KEY, version INTEGER NOT NULL, applied_at INTEGER NOT NULL)');
  const identities = new Set<string>();
  for (const migration of migrations) {
    if (identities.has(migration.id)) throw new BrowserError('CONFLICT', '迁移标识重复');
    identities.add(migration.id);
    const applied = database.get<{ version: number }>('SELECT version FROM application_migrations WHERE id = ?', [migration.id]);
    if (applied && applied.version > migration.version) {
      throw new BrowserError('STORAGE_FAILED', '资料已由较新版本升级，不能直接降级打开', false);
    }
    if (applied?.version === migration.version) continue;
    if (applied) throw new BrowserError('CONFLICT', '迁移必须使用新的标识，不能覆盖既有迁移', false);
    database.transaction(() => {
      migration.up(database);
      database.run('INSERT INTO application_migrations (id, version, applied_at) VALUES (?, ?, ?)', [migration.id, migration.version, Date.now()]);
    });
  }
}
