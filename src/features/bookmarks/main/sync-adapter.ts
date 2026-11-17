import { z } from 'zod';
import type { BookmarkNode } from '../../../shared/contracts/bookmarks';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncDataAdapter, SyncLocalChange } from '../../../shared/sync-data-ports';
import { BrowserError } from '../../../shared/errors';
import { BookmarkService } from './service';
import { BOOKMARK_ROOT_IDS } from './schema';

const nodeSchema = z.object({
  id: z.string().min(1).max(128), parentId: z.string().min(1).max(128).nullable(),
  kind: z.enum(['folder', 'bookmark']), title: z.string().min(1).max(2048),
  url: z.string().max(32768).nullable(), position: z.number().int().nonnegative(),
  createdAt: z.number().nonnegative(), updatedAt: z.number().nonnegative(),
});

export function createBookmarkSyncAdapter(runtime: FeatureRuntime, service: BookmarkService): SyncDataAdapter {
  return {
    snapshot(profileId) { return service.list(profileId).nodes.map(value => ({ type: 'bookmarks', id: value.id, value })); },
    apply(profileId, changes) {
      const relevant = changes.filter(change => change.operation === 'delete' ? change.type === 'bookmarks' : change.item.type === 'bookmarks');
      if (!relevant.length) return;
      const nodes = new Map(service.list(profileId).nodes.map(node => [node.id, node]));
      const deleted = new Set<string>();
      for (const change of relevant) applyChange(nodes, deleted, change);
      for (const node of nodes.values()) {
        let parent = node.parentId;
        const ancestors = new Set([node.id]);
        while (parent) {
          if (ancestors.has(parent)) throw new BrowserError('CONFLICT', '同步书签包含文件夹循环，已保留本地数据');
          if (deleted.has(parent)) { deleted.add(node.id); break; }
          ancestors.add(parent);
          const folder = nodes.get(parent);
          if (!folder || folder.kind !== 'folder') throw new BrowserError('CONFLICT', '同步书签缺少有效父文件夹，已保留本地数据');
          parent = folder.parentId;
        }
      }
      for (const id of deleted) nodes.delete(id);
      const ordered: BookmarkNode[] = [];
      function collect(parentId: string): void {
        const children = [...nodes.values()].filter(node => node.parentId === parentId).sort((left, right) => left.position - right.position || left.createdAt - right.createdAt || left.id.localeCompare(right.id));
        children.forEach((node, position) => { ordered.push({ ...node, position }); if (node.kind === 'folder') collect(node.id); });
      }
      for (const rootId of BOOKMARK_ROOT_IDS) collect(rootId);
      const database = runtime.storage.open(profileId);
      database.run('DELETE FROM bookmarks WHERE parent_id IS NOT NULL');
      for (const node of ordered) database.run('INSERT INTO bookmarks(id,parent_id,kind,title,url,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', [
        node.id, node.parentId, node.kind, node.title, node.url, node.position, node.createdAt, node.updatedAt,
      ]);
      database.run('UPDATE bookmark_state SET revision=revision+1 WHERE id=1');
    },
    notify(profileId) { service.notifyImported(profileId); },
    subscribe(listener) { return service.subscribeLocal(listener); },
  };
}

function applyChange(nodes: Map<string, BookmarkNode>, deleted: Set<string>, change: SyncLocalChange): void {
  if (change.operation === 'delete') {
    if (!BOOKMARK_ROOT_IDS.has(change.id)) deleted.add(change.id);
    return;
  }
  if (change.item.type !== 'bookmarks') return;
  const node = nodeSchema.parse(change.item.value);
  if (node.id !== change.item.id) throw new BrowserError('CONFLICT', '同步书签标识不一致');
  if (BOOKMARK_ROOT_IDS.has(node.id)) return;
  if (node.parentId === null) throw new BrowserError('CONFLICT', '同步书签不能新建系统根目录');
  if (node.kind === 'folder' && node.url !== null) throw new BrowserError('CONFLICT', '同步文件夹不能包含网页地址');
  if (node.kind === 'bookmark') {
    if (!node.url) throw new BrowserError('CONFLICT', '同步书签缺少地址');
    try { new URL(node.url); } catch { throw new BrowserError('CONFLICT', '同步书签地址无效'); }
  }
  deleted.delete(node.id);
  nodes.set(node.id, node);
}
