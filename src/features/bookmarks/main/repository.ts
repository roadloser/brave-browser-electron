import { randomUUID } from 'node:crypto';
import type { BookmarkNode, BookmarksState } from '../../../shared/contracts/bookmarks';
import type { ProfileDatabase } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';
import { BOOKMARK_BAR_ID, BOOKMARK_ROOT_IDS } from './schema';

const columns = 'id,parent_id AS parentId,kind,title,url,position,created_at AS createdAt,updated_at AS updatedAt';

export class BookmarkRepository {
  constructor(private readonly database: ProfileDatabase) {}

  state(query = ''): BookmarksState {
    const nodes = this.database.all<BookmarkNode>(`SELECT ${columns} FROM bookmarks ORDER BY position,created_at,id`);
    const term = query.toLocaleLowerCase().trim();
    return {
      nodes: term ? nodes.filter(node => node.title.toLocaleLowerCase().includes(term) || node.url?.toLocaleLowerCase().includes(term)) : nodes,
      revision: this.database.get<{ revision: number }>('SELECT revision FROM bookmark_state WHERE id = 1')?.revision ?? 0,
    };
  }

  get(id: string): BookmarkNode {
    const node = this.database.get<BookmarkNode>(`SELECT ${columns} FROM bookmarks WHERE id = ?`, [id]);
    if (!node) throw new BrowserError('NOT_FOUND', '书签已不存在，请刷新后重试');
    return node;
  }

  create(input: { parentId: string | null; kind: BookmarkNode['kind']; title: string; url?: string }): BookmarksState {
    return this.commit(() => {
      const parentId = this.parent(input.parentId);
      const timestamp = Date.now();
      const position = this.children(parentId).length;
      this.database.run(
        'INSERT INTO bookmarks (id,parent_id,kind,title,url,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [randomUUID(), parentId, input.kind, input.title, input.kind === 'bookmark' ? this.url(input.url) : null, position, timestamp, timestamp],
      );
    });
  }

  update(input: { id: string; title: string; url?: string }): BookmarksState {
    return this.commit(() => {
      this.assertMutable(input.id);
      const node = this.get(input.id);
      this.database.run('UPDATE bookmarks SET title=?,url=?,updated_at=? WHERE id=?', [
        input.title, node.kind === 'bookmark' ? this.url(input.url ?? node.url ?? undefined) : null, Date.now(), node.id,
      ]);
    });
  }

  move(input: { id: string; parentId: string | null; index: number }): BookmarksState {
    return this.commit(() => {
      this.assertMutable(input.id);
      const node = this.get(input.id);
      const parentId = this.parent(input.parentId);
      let ancestor: BookmarkNode | undefined = this.get(parentId);
      while (ancestor) {
        if (ancestor.id === node.id) throw new BrowserError('INVALID_ARGUMENT', '不能将文件夹移入自身或其子文件夹');
        ancestor = ancestor.parentId ? this.get(ancestor.parentId) : undefined;
      }
      const children = this.children(parentId).filter(child => child.id !== node.id);
      children.splice(Math.min(input.index, children.length), 0, node);
      this.database.run('UPDATE bookmarks SET parent_id=?,updated_at=? WHERE id=?', [parentId, Date.now(), node.id]);
      this.reorder(children);
      if (node.parentId && node.parentId !== parentId) this.reorder(this.children(node.parentId));
    });
  }

  remove(id: string): BookmarksState {
    return this.commit(() => {
      this.assertMutable(id);
      const node = this.get(id);
      this.database.run('DELETE FROM bookmarks WHERE id=?', [id]);
      if (node.parentId) this.reorder(this.children(node.parentId));
    });
  }

  private parent(id: string | null): string {
    const parentId = id ?? BOOKMARK_BAR_ID;
    if (this.get(parentId).kind !== 'folder') throw new BrowserError('INVALID_ARGUMENT', '目标不是书签文件夹');
    return parentId;
  }

  private children(parentId: string): BookmarkNode[] {
    return this.database.all<BookmarkNode>(`SELECT ${columns} FROM bookmarks WHERE parent_id=? ORDER BY position,created_at,id`, [parentId]);
  }

  private reorder(nodes: BookmarkNode[]): void {
    nodes.forEach((node, position) => this.database.run('UPDATE bookmarks SET position=? WHERE id=?', [position, node.id]));
  }

  private assertMutable(id: string): void {
    if (BOOKMARK_ROOT_IDS.has(id)) throw new BrowserError('FORBIDDEN', '系统书签文件夹不能修改、移动或删除');
  }

  private url(input?: string): string {
    if (!input?.trim()) throw new BrowserError('INVALID_ARGUMENT', '请输入书签地址');
    const value = input.trim();
    try {
      return new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`).href;
    } catch {
      throw new BrowserError('INVALID_ARGUMENT', '书签地址格式无效');
    }
  }

  private commit(operation: () => void): BookmarksState {
    return this.database.transaction(() => {
      operation();
      this.database.run('UPDATE bookmark_state SET revision=revision+1 WHERE id=1');
      return this.state();
    });
  }
}
