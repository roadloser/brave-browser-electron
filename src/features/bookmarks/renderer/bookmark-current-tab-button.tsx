import { useState } from 'react';
import { Star } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { Modal } from '../../../renderer/components/modal';
import { IconButton } from '../../../renderer/components/icon-button';
import { useBookmarks } from './use-bookmarks';
import { BookmarkDialog } from './bookmark-dialog';

export function BookmarkCurrentTabButton({ tab }: { tab?: TabSnapshot }) {
  const bookmarks = useBookmarks();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const existing = tab?.url ? bookmarks.nodes.find(node => node.kind === 'bookmark' && node.url === tab.url) : undefined;
  const available = Boolean(tab?.url && tab.url !== 'about:blank' && !tab.url.startsWith('brave:'));
  const folders = bookmarks.nodes.filter(node => node.kind === 'folder');

  return <>
    <IconButton label={existing ? '编辑此网页的书签' : '收藏此网页'} active={Boolean(existing)} disabled={!available}
      onClick={() => setOpen(true)}>
      <Star size={18} fill={existing ? 'currentColor' : 'none'} />
    </IconButton>
    {open && tab && <BookmarkDialog key={`${tab.id}:${existing?.id ?? tab.url}`}
      node={existing ?? { id: '', parentId: 'bookmarks-bar', kind: 'bookmark', title: tab.title || tab.url, url: tab.url, position: 0, createdAt: 0, updatedAt: 0 }}
      kind="bookmark" parentId={existing?.parentId ?? 'bookmarks-bar'} folders={folders}
      pending={bookmarks.pending} error={bookmarks.error}
      onClose={() => setOpen(false)}
      onSave={async draft => {
        const saved = existing
          ? await bookmarks.mutate('bookmarks.update', { id: existing.id, title: draft.title, url: draft.url })
          : await bookmarks.mutate('bookmarks.create', { ...draft, kind: 'bookmark' });
        if (saved) setOpen(false);
      }}
      extraAction={existing ? <button type="button" disabled={bookmarks.pending} onClick={() => { setOpen(false); setRemoving(true); }}>移除书签</button> : undefined}
      creating={!existing} />}
    {removing && existing && <Modal open title="移除此书签？" className="bookmark-dialog"
      onOpenChange={visible => { if (!visible && !bookmarks.pending) setRemoving(false); }}>
      <p>{existing.title}</p>
      {bookmarks.error && <p role="alert">{bookmarks.error}</p>}
      <footer><button disabled={bookmarks.pending} onClick={() => setRemoving(false)}>取消</button>
        <button disabled={bookmarks.pending} onClick={async () => {
          if (await bookmarks.mutate('bookmarks.remove', { id: existing.id })) setRemoving(false);
        }}>移除书签</button></footer>
    </Modal>}
  </>;
}
