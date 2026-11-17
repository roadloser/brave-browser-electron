import type { ShieldsPolicy } from '../../../shared/contracts/shields';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';
import type { EngineCache, RuleBundle } from './engine-port';

export const DEFAULT_SHIELDS_POLICY: ShieldsPolicy = { enabled: true, blocking: 'standard', blockScripts: false, httpsUpgrade: true };
export const shieldsMigrations: readonly Migration[] = [{
  id: 'shields.initial', version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE shield_site_rules(origin TEXT PRIMARY KEY, policy TEXT NOT NULL);
      CREATE TABLE shield_bundles(version TEXT PRIMARY KEY, bundle TEXT NOT NULL, cache BLOB, cache_metadata TEXT);
      CREATE TABLE shield_state(id INTEGER PRIMARY KEY CHECK(id=1), current_version TEXT, previous_version TEXT, revision INTEGER NOT NULL);
      INSERT INTO shield_state(id,current_version,previous_version,revision) VALUES(1,NULL,NULL,0);
    `);
  },
}];

export class SiteRulesRepository {
  constructor(private readonly database: ProfileDatabase) {}
  policy(origin: string): ShieldsPolicy {
    const row = this.database.get<{ policy: string }>('SELECT policy FROM shield_site_rules WHERE origin=?', [origin]);
    return row ? JSON.parse(row.policy) as ShieldsPolicy : { ...DEFAULT_SHIELDS_POLICY };
  }
  setPolicy(origin: string, policy?: ShieldsPolicy): void {
    this.database.transaction(() => {
      if (policy) this.database.run('INSERT INTO shield_site_rules(origin,policy) VALUES(?,?) ON CONFLICT(origin) DO UPDATE SET policy=excluded.policy', [origin, JSON.stringify(policy)]);
      else this.database.run('DELETE FROM shield_site_rules WHERE origin=?', [origin]);
      this.bump();
    });
  }
  versions() {
    return this.database.get<{ current: string | null; previous: string | null; revision: number }>('SELECT current_version AS current,previous_version AS previous,revision FROM shield_state WHERE id=1')!;
  }
  bundle(version: string): { bundle: RuleBundle; cache?: EngineCache } | undefined {
    const row = this.database.get<{ bundle: string; cache: Uint8Array | null; cache_metadata: string | null }>('SELECT bundle,cache,cache_metadata FROM shield_bundles WHERE version=?', [version]);
    if (!row) return undefined;
    return { bundle: JSON.parse(row.bundle) as RuleBundle, cache: row.cache && row.cache_metadata ? { ...JSON.parse(row.cache_metadata), bytes: row.cache } as EngineCache : undefined };
  }
  commit(bundle: RuleBundle, cache: EngineCache): void {
    this.database.transaction(() => {
      const previous = this.versions().current;
      const { bytes, ...metadata } = cache;
      this.database.run('INSERT INTO shield_bundles(version,bundle,cache,cache_metadata) VALUES(?,?,?,?) ON CONFLICT(version) DO UPDATE SET bundle=excluded.bundle,cache=excluded.cache,cache_metadata=excluded.cache_metadata', [bundle.version, JSON.stringify(bundle), bytes, JSON.stringify(metadata)]);
      this.database.run('UPDATE shield_state SET current_version=?,previous_version=?,revision=revision+1 WHERE id=1', [bundle.version, previous]);
      this.database.run('DELETE FROM shield_bundles WHERE version<>? AND version<>?', [bundle.version, previous ?? bundle.version]);
    });
  }
  switchVersion(version: string): void {
    this.database.run('UPDATE shield_state SET previous_version=current_version,current_version=?,revision=revision+1 WHERE id=1', [version]);
  }
  private bump(): void { this.database.run('UPDATE shield_state SET revision=revision+1 WHERE id=1'); }
}
