import { randomUUID } from 'node:crypto';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncLocalChange, SyncLocalItem, SyncLocalType } from '../../../shared/sync-data-ports';
import { SyncRepository } from './repository';
import { clientTagHash, itemFromEntity, localHash, rootTags, specificsForItem } from './protocol/data-mapping';
import { positionBytes } from './protocol/position';
import { applyHistoryDirective } from './protocol/history-deletions';
import type { NigoriController } from './protocol/nigori-controller';
import type { ProgressMarker, SyncEntity, SyncedEntity } from './protocol/types';
import { passwordFromData, passwordToData } from './protocol/password-mapping';

export class RemoteApplier {
  constructor(private readonly runtime: FeatureRuntime, private readonly repository: SyncRepository) {}
  apply(profileId: string, remote: SyncEntity[], nigori: NigoriController, markers: ProgressMarker[], birthday: string, chips?: string, applyRelated?: () => void): void {
    const known = this.repository.entities(profileId);
    const pending = this.repository.journal(profileId);
    const roots = this.repository.metadata<Record<string, string>>(profileId, 'roots') ?? {};
    const deviceId = this.repository.configuration(profileId)?.deviceId ?? '';
    for (const entity of remote) if (entity.id_string && entity.server_defined_unique_tag && rootTags[entity.server_defined_unique_tag]) roots[entity.id_string] = rootTags[entity.server_defined_unique_tag];
    const mapped: Array<{ entity: SyncEntity; item: SyncLocalItem | null; previous?: SyncedEntity; position: Buffer }> = [];
    const directiveChanges: SyncLocalChange[] = [];
    const mergedRemote = new Map(remote.map(entity => [entity.id_string, entity]));
    for (const previous of known) {
      if (previous.type === 'bookmarks' && previous.item && !mergedRemote.has(previous.serverId)) mergedRemote.set(previous.serverId, previous.wire);
    }
    for (const entity of mergedRemote.values()) {
      if (entity.server_defined_unique_tag) continue;
      const previous = known.find(candidate => candidate.serverId === entity.id_string || (!!entity.client_tag_hash && candidate.wire.client_tag_hash === entity.client_tag_hash));
      if (previous && previous.type !== 'bookmarks' && BigInt(entity.version ?? 0) <= BigInt(previous.version)) continue;
      const specifics = nigori.decrypt(entity.specifics ?? {});
      if (specifics.history_delete_directive) {
        directiveChanges.push(...applyHistoryDirective(specifics, this.runtime.syncData.snapshot(profileId, 'history')));
        continue;
      }
      const passwordBytes = entity.deleted ? null : nigori.decryptPassword(specifics);
      let item: SyncLocalItem | null;
      try { item = entity.deleted ? null : passwordBytes ? passwordFromData(passwordBytes, entity, this.runtime.secrets) : itemFromEntity(entity, specifics, roots); }
      finally { passwordBytes?.fill(0); }
      const matchedPending = !previous && entity.client_tag_hash ? pending.find(candidate => {
        if (!candidate.item) return false;
        if (candidate.item.type === 'passwords') {
          const mapped = passwordToData(candidate.item, this.runtime.secrets);
          try { return clientTagHash('password', mapped.tag) === entity.client_tag_hash; }
          finally { mapped.raw.fill(0); }
        }
        const mapped = specificsForItem(candidate.item, deviceId);
        return clientTagHash(mapped.field, mapped.tag) === entity.client_tag_hash;
      }) : undefined;
      if (item && matchedPending && item.id !== matchedPending.id) item = { ...item, id: matchedPending.id, value: item.type === 'passwords' ? item.value : { ...item.value, id: matchedPending.id } } as SyncLocalItem;
      if (item && previous && item.id !== previous.localId) item = { ...item, id: previous.localId, value: item.type === 'passwords' ? item.value : { ...item.value, id: previous.localId } } as SyncLocalItem;
      if (!item && !previous) continue;
      mapped.push({ entity, item, previous, position: positionBytes(specifics.bookmark?.unique_position as Record<string, unknown> | undefined ?? entity.unique_position) });
    }
    const positions = new Map<string, number>();
    mapped.sort((first, second) => Buffer.compare(first.position, second.position));
    for (const value of mapped) if (value.item?.type === 'bookmarks') {
      const parent = value.item.value.parentId ?? '';
      const position = positions.get(parent) ?? 0; positions.set(parent, position + 1); value.item.value.position = position;
    }
    const changes: SyncLocalChange[] = [...directiveChanges];
    const touched = new Set<SyncLocalType>();
    this.repository.database(profileId).transaction(() => {
      applyRelated?.();
      for (const value of mapped) {
        const type = value.item?.type ?? value.previous!.type;
        const localId = value.item?.id ?? value.previous!.localId;
        const hash = localHash(value.item, this.runtime.secrets);
        const tracked: SyncedEntity = { type, localId, serverId: value.entity.id_string!, version: value.entity.version ?? '0', item: value.item, hash, wire: value.entity };
        const unsent = pending.find(entry => entry.type === type && entry.id === localId);
        if (unsent && unsent.hash !== hash && value.previous?.hash === hash) {
          this.repository.saveEntity(profileId, tracked);
          continue;
        }
        if (unsent && unsent.hash !== hash && value.previous?.hash !== hash) {
          const existing = this.repository.conflicts(profileId).find(conflict => conflict.dataType === type && conflict.itemId === localId);
          this.repository.saveConflict(profileId, {
            id: existing?.id ?? randomUUID(), dataType: type, itemId: localId,
            localSummary: summary(unsent.item), remoteSummary: summary(value.item), detectedAt: Date.now(),
            local: unsent.item, remote: value.item, entity: tracked,
          });
          continue;
        }
        changes.push(value.item ? { operation: 'upsert', item: value.item } : { operation: 'delete', type, id: localId });
        this.repository.saveEntity(profileId, tracked);
        this.repository.dequeue(profileId, type, localId);
        touched.add(type);
      }
      this.runtime.syncData.apply(profileId, changes);
      for (const change of directiveChanges) if (change.operation === 'delete') {
        touched.add(change.type);
        const tracked = known.find(entity => entity.type === change.type && entity.localId === change.id);
        if (tracked) this.repository.saveEntity(profileId, { ...tracked, item: null, hash: 'deleted' });
        this.repository.dequeue(profileId, change.type, change.id);
      }
      for (const marker of markers) this.repository.setMetadata(profileId, 'cursor:' + marker.data_type_id, marker.token?.toString('base64') ?? '');
      this.repository.setMetadata(profileId, 'roots', roots);
      this.repository.setMetadata(profileId, 'birthday', birthday);
      if (chips) this.repository.setMetadata(profileId, 'chips', chips);
    });
    if (touched.size) this.runtime.syncData.notify(profileId, [...touched]);
  }
}
function summary(item: SyncLocalItem | null): string {
  if (!item) return '已删除';
  if (item.type === 'settings') return item.value.name + ': ' + String(item.value.value);
  if (item.type === 'passwords') return item.value.origin + ' · ' + item.value.username;
  return item.value.title || item.value.url || item.id;
}
