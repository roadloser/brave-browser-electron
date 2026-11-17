import type { SitePermission, SiteRule } from '../../../shared/contracts/site-settings';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { Migration, StorageHost } from '../../../shared/runtime-ports';

export const siteSettingsMigrations: Migration[] = [{
  id: 'site-settings.initial', version: 1, up: database => database.exec('CREATE TABLE site_permissions (origin TEXT NOT NULL, permission TEXT NOT NULL, decision TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(origin, permission))'),
}];
export class SitePolicyRepository {
  private readonly privateRules = new Map<string, SiteRule[]>();
  constructor(private readonly storage: StorageHost) {}
  list(context: BrowserContext): SiteRule[] {
    if (context.isPrivate) return [...(this.privateRules.get(context.contextId) ?? [])];
    return this.storage.open(context.profileId).all<{ origin: string; permission: SitePermission; decision: 'allow' | 'deny'; updated_at: number }>('SELECT * FROM site_permissions ORDER BY origin, permission')
      .map(row => ({ origin: row.origin, permission: row.permission, decision: row.decision, updatedAt: row.updated_at }));
  }
  set(context: BrowserContext, origin: string, permission: SitePermission, decision: 'allow' | 'deny' | 'ask'): void {
    if (context.isPrivate) {
      const rules = this.list(context).filter(rule => rule.origin !== origin || rule.permission !== permission);
      if (decision !== 'ask') rules.push({ origin, permission, decision, updatedAt: Date.now() });
      this.privateRules.set(context.contextId, rules); return;
    }
    const database = this.storage.open(context.profileId);
    if (decision === 'ask') database.run('DELETE FROM site_permissions WHERE origin=? AND permission=?', [origin, permission]);
    else database.run('INSERT INTO site_permissions (origin,permission,decision,updated_at) VALUES(?,?,?,?) ON CONFLICT(origin,permission) DO UPDATE SET decision=excluded.decision,updated_at=excluded.updated_at', [origin, permission, decision, Date.now()]);
  }
  release(contextId: string): void { this.privateRules.delete(contextId); }
  reset(context: BrowserContext, origin: string): void {
    if (context.isPrivate) this.privateRules.set(context.contextId, this.list(context).filter(rule => rule.origin !== origin));
    else this.storage.open(context.profileId).run('DELETE FROM site_permissions WHERE origin=?', [origin]);
  }
}
