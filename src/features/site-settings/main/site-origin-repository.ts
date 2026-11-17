import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { Migration, StorageHost } from '../../../shared/runtime-ports';

export type ObservedOrigin = { origin: string; lastSeen: number };
export const siteOriginMigrations: Migration[] = [{
  id: 'site-settings.observed-origins', version: 1, up: database => database.exec('CREATE TABLE observed_site_origins (origin TEXT PRIMARY KEY, last_seen INTEGER NOT NULL)'),
}];
export class SiteOriginRepository {
  private readonly ephemeral = new Map<string, Map<string, number>>();
  constructor(private readonly storage: StorageHost) {}
  observe(context: BrowserContext, origin: string, timestamp = Date.now()): void {
    if (context.isPrivate) {
      const records = this.ephemeral.get(context.contextId) ?? new Map<string, number>();
      records.set(origin, timestamp); this.ephemeral.set(context.contextId, records); return;
    }
    this.storage.open(context.profileId).run('INSERT INTO observed_site_origins(origin,last_seen) VALUES(?,?) ON CONFLICT(origin) DO UPDATE SET last_seen=MAX(last_seen,excluded.last_seen)', [origin, timestamp]);
  }
  list(context: BrowserContext): ObservedOrigin[] {
    if (context.isPrivate) return [...(this.ephemeral.get(context.contextId) ?? [])].map(([origin, lastSeen]) => ({ origin, lastSeen }));
    return this.storage.open(context.profileId).all<ObservedOrigin>('SELECT origin,last_seen AS lastSeen FROM observed_site_origins ORDER BY last_seen DESC');
  }
  release(contextId: string): void { this.ephemeral.delete(contextId); }
  dispose(): void { this.ephemeral.clear(); }
}
