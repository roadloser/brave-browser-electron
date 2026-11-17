import { useState } from 'react';
import type { BookmarkNode } from '../../../shared/contracts/bookmarks';

type Props = {
  node: BookmarkNode; nodes: BookmarkNode[]; pending: boolean; error: string;
  onMove: (parentId: string) => Promise<void>; onClose: () => void;
};

export function BookmarkMoveDialog({ node, nodes, pending, error, onMove, onClose }: Props) {
  const [parentId, setParentId] = useState(node.parentId ?? 'bookmarks-bar');
  const excluded = new Set([node.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const child of nodes) {
      if (child.parentId && excluded.has(child.parentId) && !excluded.has(child.id)) {
        excluded.add(child.id);
        changed = true;
      }
    }
  }
  const folders = nodes.filter(candidate => candidate.kind === 'folder' && !excluded.has(candidate.id));
  return <div className="bookmark-dialog-backdrop">
    <section className="bookmark-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmark-move-title">
      <h2 id="bookmark-move-title">移动“{node.title}”</h2>
      <form onSubmit={event => { event.preventDefault(); void onMove(parentId); }}>
        <label>目标文件夹<select autoFocus value={parentId} onChange={event => setParentId(event.target.value)}>
          {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
        </select></label>
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" disabled={pending} onClick={onClose}>取消</button>
          <button type="submit" disabled={pending}>{pending ? '移动中…' : '移动'}</button></footer>
      </form>
    </section>
  </div>;
}
