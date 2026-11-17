import type { ProfileSnapshot } from '../../shared/contracts/browser-core';
import { BrowserError } from '../../shared/errors';
import { randomUUID } from 'node:crypto';
import type { StorageHost } from '../../shared/runtime-ports';

export class ProfileManager {
  constructor(private readonly storage: StorageHost) {
    this.database().exec('CREATE TABLE IF NOT EXISTS browser_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, is_default INTEGER NOT NULL)');
    this.database().run('INSERT OR IGNORE INTO browser_profiles (id, name, is_default) VALUES (?, ?, 1)', ['default', '个人资料']);
  }

  list(): ProfileSnapshot[] {
    return this.database().all<{ id: string; name: string; is_default: number }>('SELECT * FROM browser_profiles ORDER BY is_default DESC, rowid')
      .map(profile => ({ id: profile.id, name: profile.name, isDefault: profile.is_default === 1 }));
  }

  get(profileId = 'default'): ProfileSnapshot {
    const profile = this.list().find(candidate => candidate.id === profileId);
    if (!profile) throw new BrowserError('NOT_FOUND', '找不到此浏览器资料');
    return { ...profile };
  }

  create(name: string): ProfileSnapshot {
    const profile = { id: randomUUID(), name: name.trim(), isDefault: false };
    if (!profile.name || profile.name.length > 80) throw new BrowserError('INVALID_ARGUMENT', '资料名称不合法');
    this.database().run('INSERT INTO browser_profiles (id, name, is_default) VALUES (?, ?, 0)', [profile.id, profile.name]);
    return profile;
  }

  rename(profileId: string, name: string): ProfileSnapshot {
    const profile = this.get(profileId);
    if (!name.trim() || name.length > 80) throw new BrowserError('INVALID_ARGUMENT', '资料名称不合法');
    this.database().run('UPDATE browser_profiles SET name = ? WHERE id = ?', [name.trim(), profileId]);
    return { ...profile, name: name.trim() };
  }

  remove(profileId: string): void {
    if (this.get(profileId).isDefault) throw new BrowserError('FORBIDDEN', '不能删除默认资料');
    this.database().run('DELETE FROM browser_profiles WHERE id = ?', [profileId]);
  }

  private database() { return this.storage.open('catalog'); }
}
