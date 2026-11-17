import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncLocalChange } from '../../../shared/sync-data-ports';
import { BrowserError } from '../../../shared/errors';
import { SyncRepository } from './repository';

export class ConflictResolver {
  constructor(private readonly runtime: FeatureRuntime, private readonly repository: SyncRepository) {}
  resolve(profileId: string, id: string, keep: 'local' | 'remote'): void {
    const conflict = this.repository.conflicts(profileId).find(candidate => candidate.id === id);
    if (!conflict) throw new BrowserError('NOT_FOUND', '此同步冲突已处理');
    this.repository.database(profileId).transaction(() => {
      this.repository.saveEntity(profileId, conflict.entity);
      if (keep === 'remote') {
        const change: SyncLocalChange = conflict.remote ? { operation: 'upsert', item: conflict.remote } : { operation: 'delete', type: conflict.dataType as 'bookmarks' | 'history' | 'settings', id: conflict.itemId };
        this.runtime.syncData.apply(profileId, [change]);
        this.repository.dequeue(profileId, conflict.entity.type, conflict.itemId);
      }
      this.repository.removeConflict(profileId, id);
    });
    if (keep === 'remote') this.runtime.syncData.notify(profileId, [conflict.entity.type]);
  }
}
