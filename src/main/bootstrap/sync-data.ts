import type { SyncDataAdapter, SyncDataPort, SyncLocalChange, SyncLocalType } from '../../shared/sync-data-ports';
import { BrowserError } from '../../shared/errors';

export class SyncDataCoordinator implements SyncDataPort {
  private readonly adapters = new Map<SyncLocalType, SyncDataAdapter>();
  private readonly listeners = new Set<(profileId: string, type: SyncLocalType) => void>();

  register(type: SyncLocalType, adapter: SyncDataAdapter) {
    if (this.adapters.has(type)) throw new BrowserError('CONFLICT', '同步数据源重复注册', false);
    this.adapters.set(type, adapter);
    const dispose = adapter.subscribe(profileId => {
      for (const listener of this.listeners) listener(profileId, type);
    });
    return () => {
      dispose();
      if (this.adapters.get(type) === adapter) this.adapters.delete(type);
    };
  }

  snapshot(profileId: string, type: SyncLocalType) {
    return this.adapter(type).snapshot(profileId);
  }

  apply(profileId: string, changes: readonly SyncLocalChange[]) {
    const grouped = new Map<SyncLocalType, SyncLocalChange[]>();
    for (const change of changes) {
      const type = change.operation === 'upsert' ? change.item.type : change.type;
      const entries = grouped.get(type) ?? [];
      entries.push(change);
      grouped.set(type, entries);
    }
    for (const [type, entries] of grouped) this.adapter(type).apply(profileId, entries);
  }

  notify(profileId: string, types: readonly SyncLocalType[]) {
    for (const type of new Set(types)) this.adapter(type).notify(profileId);
  }

  subscribe(listener: (profileId: string, type: SyncLocalType) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private adapter(type: SyncLocalType) {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new BrowserError('UNAVAILABLE', '同步数据源尚未接入：' + type);
    return adapter;
  }
}
