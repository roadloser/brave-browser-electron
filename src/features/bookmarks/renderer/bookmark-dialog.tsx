import { useState, type ReactNode } from 'react';
import type { BookmarkNode } from '../../../shared/contracts/bookmarks';
import { Modal } from '../../../renderer/components/modal';

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
  extraAction?: ReactNode;
  creating?: boolean;
};

export function BookmarkDialog({ node, kind, parentId, folders, pending, error, onSave, onClose, extraAction, creating }: Props) {
  const [title, setTitle] = useState(node?.title ?? '');
  const [url, setUrl] = useState(node?.url ?? '');
  const [folderId, setFolderId] = useState(parentId ?? 'bookmarks-bar');

  return <Modal open title={`${node && !creating ? '编辑' : '添加'}${kind === 'folder' ? '文件夹' : '书签'}`}
    className="bookmark-dialog" onOpenChange={open => { if (!open && !pending) onClose(); }}>
      <form onSubmit={event => {
        event.preventDefault();
        void onSave({ title: title.trim(), url: kind === 'bookmark' ? url.trim() : undefined, parentId: folderId, kind });
      }}>
        <label>名称<input autoFocus required maxLength={2048} value={title} onChange={event => setTitle(event.target.value)} /></label>
        {kind === 'bookmark' && <label>地址<input required maxLength={32768} value={url} onChange={event => setUrl(event.target.value)} /></label>}
        {(!node || creating) && <label>文件夹<select value={folderId} onChange={event => setFolderId(event.target.value)}>
          {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
        </select></label>}
        {error && <p role="alert">{error}</p>}
        <footer>{extraAction}<button type="button" disabled={pending} onClick={onClose}>取消</button>
          <button type="submit" disabled={pending || !title.trim()}>{pending ? '保存中…' : '保存'}</button></footer>
      </form>
  </Modal>;
}
