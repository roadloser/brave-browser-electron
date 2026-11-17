import type { PrivacyMode } from '../../../shared/contracts/fingerprint-privacy';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';

export const privacyMigrations: readonly Migration[] = [{
  id: 'fingerprint-privacy.initial', version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE privacy_state(id INTEGER PRIMARY KEY CHECK(id=1), default_mode TEXT NOT NULL, revision INTEGER NOT NULL);
      INSERT INTO privacy_state(id,default_mode,revision) VALUES(1,'balanced',0);
      CREATE TABLE privacy_sites(site TEXT PRIMARY KEY, mode TEXT NOT NULL);
      CREATE TABLE privacy_tokens(site TEXT PRIMARY KEY, token TEXT NOT NULL, version INTEGER NOT NULL);
    `);
  },
}];

export class PrivacyRepository {
  constructor(private readonly database: ProfileDatabase) {}
  state() { return this.database.get<{ mode: PrivacyMode; revision: number }>('SELECT default_mode AS mode,revision FROM privacy_state WHERE id=1')!; }
  siteMode(site: string): PrivacyMode | undefined { return this.database.get<{ mode: PrivacyMode }>('SELECT mode FROM privacy_sites WHERE site=?', [site])?.mode; }
  setDefault(mode: PrivacyMode): void { this.database.run('UPDATE privacy_state SET default_mode=?,revision=revision+1 WHERE id=1', [mode]); }
  setSite(site: string, mode: PrivacyMode | null): void {
    this.database.transaction(() => {
      if (mode === null) this.database.run('DELETE FROM privacy_sites WHERE site=?', [site]);
      else this.database.run('INSERT INTO privacy_sites(site,mode) VALUES(?,?) ON CONFLICT(site) DO UPDATE SET mode=excluded.mode', [site, mode]);
      this.database.run('UPDATE privacy_state SET revision=revision+1 WHERE id=1');
    });
  }
  token(site: string): string | undefined { return this.database.get<{ token: string }>('SELECT token FROM privacy_tokens WHERE site=? AND version=1', [site])?.token; }
  saveToken(site: string, token: string): void {
    this.database.run('INSERT INTO privacy_tokens(site,token,version) VALUES(?,?,1) ON CONFLICT(site) DO UPDATE SET token=excluded.token,version=1', [site, token]);
  }
}
