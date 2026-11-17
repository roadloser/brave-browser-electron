import { randomUUID } from 'node:crypto';
import { BrowserError } from '../../../shared/errors';
import { SyncRepository, type JournalEntry } from './repository';
import { clientTagHash, specificsForItem, dataTypeIds } from './protocol/data-mapping';
import { deletionSpecifics } from './protocol/history-deletions';
import { commitResults } from './protocol/response';
import type { NigoriController } from './protocol/nigori-controller';
import type { SyncEntity, SyncProtocolPort, SyncRequestContext } from './protocol/types';
import type { SecretStorePort } from '../../../shared/runtime-ports';
import { passwordToData } from './protocol/password-mapping';

export class CommitUploader {
  constructor(private readonly repository: SyncRepository, private readonly protocol: SyncProtocolPort, private readonly secrets: SecretStorePort) {}
  async upload(profileId: string, context: SyncRequestContext, nigori: NigoriController, types: number[]): Promise<void> {
    const conflicts = new Set(this.repository.conflicts(profileId).map(conflict => conflict.dataType + ':' + conflict.itemId));
    const pending = this.repository.journal(profileId).filter(entry => types.includes(dataTypeIds[entry.type]) && !conflicts.has(entry.type + ':' + entry.id));
    pending.sort((first, second) => {
      if (first.item?.type === 'bookmarks' && second.item?.type === 'bookmarks') return depth(first, pending) - depth(second, pending);
      return first.queuedAt - second.queuedAt;
    });
    for (let offset = 0; offset < pending.length; offset += 100) {
      context.signal.throwIfAborted();
      const batch = pending.slice(offset, offset + 100);
      const entities = batch.map(entry => this.entity(profileId, entry, context.deviceId, nigori));
      const results = commitResults(await this.protocol.commit(context, entities, types), batch.length);
      let failure = false;
      this.repository.database(profileId).transaction(() => {
        results.forEach((result, index) => {
          const entry = batch[index];
          if (result.response_type !== 1) { failure = true; return; }
          const previous = this.repository.entities(profileId).find(value => value.type === entry.type && value.localId === entry.id);
          const wire = entry.type === 'history' && !entry.item && previous ? previous.wire : entities[index];
          this.repository.saveEntity(profileId, {
            type: entry.type, localId: entry.id, serverId: entry.type === 'history' && !entry.item && previous ? previous.serverId : result.id_string ?? wire.id_string!,
            version: entry.type === 'history' && !entry.item && previous ? previous.version : result.version ?? '0',
            hash: entry.hash, item: entry.item, wire: { ...wire, id_string: result.id_string ?? wire.id_string, version: result.version ?? wire.version },
          });
          const latest = this.repository.journal(profileId).find(value => value.type === entry.type && value.id === entry.id);
          if (latest?.hash === entry.hash) this.repository.dequeue(profileId, entry.type, entry.id);
        });
      });
      if (failure) throw new BrowserError('CONFLICT', '部分同步提交未被接受，成功部分已记录，其余保留等待重试');
    }
  }
  private entity(profileId: string, entry: JournalEntry, deviceId: string, nigori: NigoriController): SyncEntity {
    const previous = this.repository.entities(profileId).find(value => value.type === entry.type && value.localId === entry.id);
    if (!entry.item) {
      if (!previous) throw new BrowserError('CONFLICT', '删除记录缺少同步版本');
      if (entry.type === 'history' && previous.item?.type === 'history') {
        const id = randomUUID();
        return { id_string: id, version: '0', name: 'encrypted', client_tag_hash: clientTagHash('history_delete_directive', id), specifics: nigori.encrypt(deletionSpecifics(previous.item), 'history_delete_directive') };
      }
      return { id_string: previous.serverId, version: previous.version, deleted: true, specifics: previous.wire.specifics, client_tag_hash: previous.wire.client_tag_hash };
    }
    if (entry.item.type === 'passwords') {
      const mapped = passwordToData(entry.item, this.secrets);
      try {
        return {
          id_string: previous?.serverId ?? entry.id, version: previous?.version ?? '0', name: 'encrypted',
          mtime: String(entry.item.value.updatedAt), ctime: String(entry.item.value.createdAt),
          client_tag_hash: clientTagHash('password', mapped.tag), specifics: nigori.encryptPassword(mapped.raw),
        };
      } finally { mapped.raw.fill(0); }
    }
    const mapped = specificsForItem(entry.item, deviceId);
    const roots = this.repository.metadata<Record<string, string>>(profileId, 'roots') ?? {};
    const parent = entry.item.type === 'bookmarks' ? entry.item.value.parentId : undefined;
    const parentServer = parent ? Object.entries(roots).find(([, local]) => local === parent)?.[0] ?? this.repository.entities(profileId).find(value => value.type === 'bookmarks' && value.localId === parent)?.serverId ?? parent : undefined;
    return {
      id_string: previous?.serverId ?? entry.id, version: previous?.version ?? '0', name: 'encrypted',
      mtime: String(entry.item.type === 'bookmarks' ? entry.item.value.updatedAt : Date.now()),
      ctime: previous?.wire.ctime ?? String(entry.item.type === 'bookmarks' ? entry.item.value.createdAt : Date.now()), parent_id_string: parentServer,
      folder: entry.item.type === 'bookmarks' && entry.item.value.kind === 'folder',
      originator_cache_guid: deviceId, originator_client_item_id: entry.id,
      client_tag_hash: clientTagHash(mapped.field, mapped.tag), specifics: nigori.encrypt(mapped.specifics, mapped.field),
    };
  }
}
function depth(entry: JournalEntry, pending: JournalEntry[]): number {
  let current = entry.item; let count = 0;
  while (current?.type === 'bookmarks' && current.value.parentId && count < pending.length) {
    current = pending.find(candidate => candidate.type === 'bookmarks' && candidate.id === (current?.type === 'bookmarks' ? current.value.parentId : ''))?.item ?? null;
    count += 1;
  }
  return count;
}
