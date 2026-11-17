import { createHash } from 'node:crypto';
import type { SyncLocalItem, SyncLocalType } from '../../../../shared/sync-data-ports';
import type { BookmarkNode } from '../../../../shared/contracts/bookmarks';
import { BrowserError } from '../../../../shared/errors';
import { encodeProto } from './schema';
import type { Specifics, SyncEntity } from './types';

export const dataTypeIds = { bookmarks: 32904, settings: 37702, history: 963985 };
export const rootGuids: Record<string, string> = {
  'bookmarks-bar': '0bc5d13f-2cba-5d74-951f-3f233fe6c908',
  'other-bookmarks': '82b081ec-3dd3-529c-8475-ab6c344590dd',
  'mobile-bookmarks': '4cf2e351-0e85-532b-bb37-df045d8f8d0f',
};
export const rootTags: Record<string, string> = { bookmark_bar: 'bookmarks-bar', other_bookmarks: 'other-bookmarks', synced_bookmarks: 'mobile-bookmarks' };
const windowsEpoch = 11644473600000000n;
const preferenceNames: Record<string, string> = {
  showBookmarksBar: 'bookmark_bar.show_on_all_tabs', verticalTabs: 'brave.tabs.vertical_tabs_enabled',
  startup: 'session.restore_on_startup', doNotTrack: 'enable_do_not_track',
};
export function windowsMicros(milliseconds: number): string { return (BigInt(Math.trunc(milliseconds)) * 1000n + windowsEpoch).toString(); }
export function unixMillis(micros: unknown): number {
  try { return Number((BigInt(String(micros)) - windowsEpoch) / 1000n); } catch { throw new BrowserError('INVALID_ARGUMENT', '同步时间戳无效'); }
}
export function localHash(item: SyncLocalItem | null): string {
  if (!item) return 'deleted';
  const value = item.type === 'history' ? { ...item.value, visitCount: 1 } : item.value;
  return createHash('sha256').update(JSON.stringify({ type: item.type, id: item.id, value })).digest('hex');
}
export function clientTagHash(specificsField: string, tag: string): string {
  return createHash('sha1').update(encodeProto('EntitySpecifics', { [specificsField]: {} })).update(tag).digest('base64');
}
export function specificsForItem(item: SyncLocalItem, deviceId: string): { specifics: Specifics; tag: string; field: string } {
  if (item.type === 'bookmarks') {
    const node = item.value;
    const position = Buffer.alloc(8);
    position.writeBigUInt64BE(BigInt(node.position) ^ 0x8000000000000000n);
    const suffix = Buffer.from(createHash('sha1').update(clientTagHash('bookmark', node.id)).digest('base64'));
    return {
      field: 'bookmark', tag: node.id,
      specifics: { bookmark: {
        guid: node.id, parent_guid: rootGuids[node.parentId ?? 'bookmarks-bar'] ?? node.parentId,
        full_title: node.title, legacy_canonicalized_title: node.title,
        type: node.kind === 'folder' ? 2 : 1, url: node.url ?? undefined,
        creation_time_us: windowsMicros(node.createdAt),
        unique_position: { value: Buffer.concat([position, suffix]) },
      } },
    };
  }
  if (item.type === 'history') {
    const timestamp = windowsMicros(item.value.visitedAt);
    return { field: 'history', tag: timestamp, specifics: { history: {
      visit_time_windows_epoch_micros: timestamp, originator_cache_guid: deviceId,
      redirect_entries: [{ originator_visit_id: String(item.value.visitedAt), url: item.value.url, title: item.value.title, hidden: false }],
      page_transition: { core_transition: 0 }, browser_type: 1,
    } } };
  }
  const name = preferenceNames[item.value.name];
  if (!name) throw new BrowserError('UNAVAILABLE', '此设置尚未建立 Brave 同步偏好映射');
  const value = item.value.name === 'startup' ? item.value.value === 'restore' ? 1 : 5 : item.value.value;
  return { field: 'preference', tag: name, specifics: { preference: { name, value: JSON.stringify(value) } } };
}
export function itemFromEntity(entity: SyncEntity, specifics: Specifics, serverRoots: Record<string, string>): SyncLocalItem | null {
  if (specifics.bookmark) {
    const bookmark = specifics.bookmark;
    if (typeof bookmark.guid !== 'string' || !bookmark.guid) throw new BrowserError('CONFLICT', '远端旧书签缺少GUID，不能猜测合并身份');
    const parentGuid = String(bookmark.parent_guid ?? '');
    const parentId = Object.entries(rootGuids).find(([, guid]) => guid === parentGuid)?.[0] ?? (parentGuid || serverRoots[entity.parent_id_string ?? '']);
    if (!parentId) throw new BrowserError('CONFLICT', '远端书签缺少父目录');
    const folder = bookmark.type === 2 || entity.folder === true;
    const node: BookmarkNode = {
      id: bookmark.guid, parentId, kind: folder ? 'folder' : 'bookmark',
      title: String(bookmark.full_title ?? bookmark.legacy_canonicalized_title ?? entity.name ?? ''),
      url: folder ? null : String(bookmark.url ?? ''), position: 0,
      createdAt: bookmark.creation_time_us ? unixMillis(bookmark.creation_time_us) : Number(entity.ctime ?? Date.now()),
      updatedAt: Number(entity.mtime ?? Date.now()),
    };
    return { type: 'bookmarks', id: node.id, value: node };
  }
  if (specifics.history) {
    const history = specifics.history;
    const entries = history.redirect_entries as Array<{ url?: string; title?: string }> | undefined;
    const last = entries?.at(-1);
    if (!last?.url || !history.originator_cache_guid || !history.visit_time_windows_epoch_micros) throw new BrowserError('CONFLICT', '远端历史条目缺少必需字段');
    const id = String(history.originator_cache_guid) + ':' + String(history.visit_time_windows_epoch_micros);
    return { type: 'history', id, value: { id, url: last.url, title: last.title ?? last.url, visitedAt: unixMillis(history.visit_time_windows_epoch_micros), visitCount: 1 } };
  }
  if (specifics.preference) {
    const name = Object.entries(preferenceNames).find(([, remote]) => remote === specifics.preference?.name)?.[0];
    if (!name) return null;
    let value: unknown;
    try { value = JSON.parse(specifics.preference.value ?? 'null'); } catch { throw new BrowserError('CONFLICT', '远端偏好值不是合法JSON'); }
    if (name === 'startup') {
      if (value !== 1 && value !== 5) return null;
      return { type: 'settings', id: name, value: { name: 'startup', value: value === 1 ? 'restore' : 'new-tab', updatedAt: 0 } };
    }
    if (typeof value !== 'boolean') throw new BrowserError('CONFLICT', '远端偏好值类型不兼容');
    return { type: 'settings', id: name, value: { name: name as 'showBookmarksBar' | 'verticalTabs' | 'doNotTrack', value, updatedAt: 0 } };
  }
  return null;
}
export function entityType(entity: SyncEntity): SyncLocalType | undefined {
  if (entity.specifics?.bookmark) return 'bookmarks';
  if (entity.specifics?.history) return 'history';
  if (entity.specifics?.preference) return 'settings';
  return undefined;
}
