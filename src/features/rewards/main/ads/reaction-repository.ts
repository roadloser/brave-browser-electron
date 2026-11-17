import type { Migration, ProfileDatabase } from '../../../../shared/runtime-ports';
import type { AdCreative, AdPlacement, AdEventType } from './delivery-types';

export type AdReaction = 'neutral' | 'liked' | 'disliked';
export type AdReactionEvent = { id: string; placement: AdPlacement; type: AdEventType; createdAt: number };
export const adReactionMigrations: readonly Migration[] = [{ id: 'rewards.ad-reactions', version: 1,
  up(database) { database.exec(`
    CREATE TABLE rewards_ad_reactions(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id));
    CREATE TABLE rewards_ad_reaction_events(id TEXT PRIMARY KEY,record TEXT NOT NULL,queued INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE rewards_ad_reaction_requests(id TEXT PRIMARY KEY);
  `); },
}];

export class AdReactionRepository {
  constructor(private readonly database: ProfileDatabase) {}
  reaction(advertiserId: string): AdReaction { return (this.value('advertiser', advertiserId) as AdReaction | undefined) ?? 'neutral'; }
  flagged(creativeSetId: string): boolean { return this.value('flag', creativeSetId) === 'true'; }
  excluded(creative: AdCreative): boolean { return this.flagged(creative.creativeSetId) || Boolean(creative.advertiserId && this.reaction(creative.advertiserId) === 'disliked'); }
  processed(requestId: string): boolean { return Boolean(this.database.get('SELECT id FROM rewards_ad_reaction_requests WHERE id=?', [requestId])); }
  update(requestId: string, kind: 'advertiser' | 'flag', id: string, value: string, event?: AdReactionEvent): void {
    this.database.transaction(() => {
      if (this.processed(requestId)) return;
      this.database.run('INSERT INTO rewards_ad_reaction_requests(id) VALUES(?)', [requestId]);
      this.database.run('INSERT INTO rewards_ad_reactions(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value', [kind, id, value]);
      if (event) this.database.run('INSERT INTO rewards_ad_reaction_events(id,record) VALUES(?,?)', [event.id, JSON.stringify(event)]);
    });
  }
  pending(): AdReactionEvent[] { return this.database.all<{ record: string }>('SELECT record FROM rewards_ad_reaction_events WHERE queued=0 ORDER BY rowid').map(row => JSON.parse(row.record) as AdReactionEvent); }
  queued(id: string): void { this.database.run('UPDATE rewards_ad_reaction_events SET queued=1 WHERE id=?', [id]); }
  private value(kind: string, id: string): string | undefined { return this.database.get<{ value: string }>('SELECT value FROM rewards_ad_reactions WHERE kind=? AND id=?', [kind, id])?.value; }
}
