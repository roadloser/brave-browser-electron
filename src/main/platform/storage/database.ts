import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import { BrowserError } from '../../../shared/errors';
import type { Migration, ProfileDatabase, SqlParameters, StorageHost } from '../../../shared/runtime-ports';
import { profileDatabasePath, profilePath } from './profile-paths';
import { runMigrations } from './migration-runner';

class SqliteProfileDatabase implements ProfileDatabase {
  constructor(private readonly database: Database.Database) {}

  get<Row>(sql: string, parameters?: SqlParameters): Row | undefined {
    const statement = this.database.prepare(sql);
    return (Array.isArray(parameters) ? statement.get(...parameters) : parameters ? statement.get(parameters) : statement.get()) as Row | undefined;
  }

  all<Row>(sql: string, parameters?: SqlParameters): Row[] {
    const statement = this.database.prepare(sql);
    return (Array.isArray(parameters) ? statement.all(...parameters) : parameters ? statement.all(parameters) : statement.all()) as Row[];
  }

  run(sql: string, parameters?: SqlParameters) {
    const statement = this.database.prepare(sql);
    return Array.isArray(parameters) ? statement.run(...parameters) : parameters ? statement.run(parameters) : statement.run();
  }

  exec(sql: string): void { this.database.exec(sql); }

  transaction<Value>(operation: () => Value): Value {
    return this.database.transaction(() => {
      const value = operation();
      if (value && typeof value === 'object' && 'then' in value) {
        throw new BrowserError('INVALID_ARGUMENT', '数据库事务不能跨异步操作');
      }
      return value;
    })();
  }
}

export class SqliteStorageHost implements StorageHost {
  private readonly connections = new Map<string, { native: Database.Database; port: ProfileDatabase }>();
  constructor(private readonly userDataPath?: string) {}

  open(profileId: string): ProfileDatabase {
    const existing = this.connections.get(profileId);
    if (existing) return existing.port;
    const native = new Database(profileDatabasePath(profileId, this.userDataPath), { timeout: 5000 });
    try {
      native.pragma('journal_mode = WAL');
      native.pragma('foreign_keys = ON');
      native.pragma('synchronous = NORMAL');
      const port = new SqliteProfileDatabase(native);
      this.connections.set(profileId, { native, port });
      return port;
    } catch (error) {
      native.close();
      throw error;
    }
  }

  migrate(profileId: string, migrations: readonly Migration[]): void {
    runMigrations(this.open(profileId), migrations);
  }

  close(profileId?: string): void {
    const entries = profileId ? [...this.connections].filter(([id]) => id === profileId) : [...this.connections];
    for (const [id, connection] of entries) {
      connection.native.close();
      this.connections.delete(id);
    }
  }

  remove(profileId: string): void {
    if (profileId === 'catalog') throw new BrowserError('FORBIDDEN', '不能删除资料目录数据库');
    this.close(profileId);
    rmSync(profilePath(profileId, this.userDataPath), { recursive: true, force: true });
  }
}
