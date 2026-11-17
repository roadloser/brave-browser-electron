import { useState } from 'react';
import type { BookmarkNode } from '../../../shared/contracts/bookmarks';

export type BookmarkDraft = { title: string; url?: string; parentId: string | null; kind: BookmarkNode['kind'] };

type Props = {
  node?: BookmarkNode;
  kind: BookmarkNode['kind'];
  parentId: string | null;
  folders: BookmarkNode[];
  pending: boolean;
  error: string;
  onSave: (draft: BookmarkDraft) => Promise<void>;
  onClose: () => void;
};

export function BookmarkDialog({ node, kind, parentId, folders, pending, error, onSave, onClose }: Props) {
  const [title, setTitle] = useState(node?.title ?? '');
  const [url, setUrl] = useState(node?.url ?? '');
  const [folderId, setFolderId] = useState(parentId ?? 'bookmarks-bar');

  return <div className="bookmark-dialog-backdrop" onKeyDown={event => {
    if (event.key === 'Escape' && !pending) onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="bookmark-dialog-title" className="bookmark-dialog">
      <h2 id="bookmark-dialog-title">{node ? '编辑' : '添加'}{kind === 'folder' ? '文件夹' : '书签'}</h2>
      <form onSubmit={event => {
        event.preventDefault();
        void onSave({ title: title.trim(), url: kind === 'bookmark' ? url.trim() : undefined, parentId: folderId, kind });
      }}>
        <label>名称<input autoFocus required maxLength={2048} value={title} onChange={event => setTitle(event.target.value)} /></label>
        {kind === 'bookmark' && <label>地址<input required maxLength={32768} value={url} onChange={event => setUrl(event.target.value)} /></label>}
        {!node && <label>文件夹<select value={folderId} onChange={event => setFolderId(event.target.value)}>
          {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
        </select></label>}
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" disabled={pending} onClick={onClose}>取消</button>
          <button type="submit" disabled={pending || !title.trim()}>{pending ? '保存中…' : '保存'}</button></footer>
      </form>
    </section>
  </div>;
}
