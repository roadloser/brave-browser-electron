import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncLocalType } from '../../../shared/sync-data-ports';
import { localHash, rootGuids } from './protocol/data-mapping';
import { SyncRepository } from './repository';

export class ChangeJournal {
  constructor(private readonly runtime: FeatureRuntime, private readonly repository: SyncRepository) {}
  capture(profileId: string, enabled: SyncLocalType[]): void {
    const known = this.repository.entities(profileId);
    this.repository.database(profileId).transaction(() => {
      for (const type of enabled) {
        const current = this.runtime.syncData.snapshot(profileId, type).filter(item => item.type !== 'bookmarks' || !rootGuids[item.id]);
        const ids = new Set(current.map(item => item.id));
        for (const item of current) {
          const hash = localHash(item, this.runtime.secrets);
          const previous = known.find(entity => entity.type === type && entity.localId === item.id);
          if (previous?.hash === hash) this.repository.dequeue(profileId, type, item.id);
          else this.repository.enqueue(profileId, { type, id: item.id, item, hash, queuedAt: Date.now() });
        }
        for (const previous of known.filter(entity => entity.type === type && entity.item)) {
          if (!ids.has(previous.localId)) this.repository.enqueue(profileId, { type, id: previous.localId, item: null, hash: 'deleted', queuedAt: Date.now() });
        }
        for (const pending of this.repository.journal(profileId)) {
          if (pending.type === type && pending.item && !ids.has(pending.id) && !known.some(entity => entity.type === type && entity.localId === pending.id)) {
            this.repository.dequeue(profileId, type, pending.id);
          }
        }
      }
    });
  }
}
