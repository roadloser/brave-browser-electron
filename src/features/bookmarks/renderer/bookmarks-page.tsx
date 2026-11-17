import { useState } from 'react';
import type { BookmarkNode } from '../../../shared/contracts/bookmarks';
import { browserClient } from '../../../renderer/client/browser-client';
import { useBookmarks } from './use-bookmarks';
import { BookmarkDialog, type BookmarkDraft } from './bookmark-dialog';
import { BookmarkMoveDialog } from './bookmark-move-dialog';
import { BookmarkFolderTree } from './bookmark-folder-tree';
import './bookmarks.css';

type Editor = { kind: BookmarkNode['kind']; node?: BookmarkNode } | null;

export function BookmarksPage() {
  const bookmarks = useBookmarks();
  const [folderId, setFolderId] = useState('bookmarks-bar');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Editor>(null);
  const [moving, setMoving] = useState<BookmarkNode | null>(null);
  const [deleting, setDeleting] = useState<BookmarkNode | null>(null);
  const [openError, setOpenError] = useState('');
  const folders = bookmarks.nodes.filter(node => node.kind === 'folder');
  const selectedFolder = folders.find(node => node.id === folderId);
  const activeFolderId = selectedFolder?.id ?? 'bookmarks-bar';
  const term = query.trim().toLocaleLowerCase();
  const visible = bookmarks.nodes.filter(node => node.parentId !== null && (term
    ? node.title.toLocaleLowerCase().includes(term) || node.url?.toLocaleLowerCase().includes(term)
    : node.parentId === activeFolderId)).sort((left, right) => left.position - right.position);

  async function save(draft: BookmarkDraft) {
    const saved = editor?.node
      ? await bookmarks.mutate('bookmarks.update', { id: editor.node.id, title: draft.title, url: draft.url })
      : await bookmarks.mutate('bookmarks.create', draft);
    if (saved) setEditor(null);
  }

  async function open(node: BookmarkNode) {
    if (node.kind === 'folder') { setFolderId(node.id); setQuery(''); return; }
    try {
      setOpenError('');
      await browserClient.command('browser.openTab', { url: node.url ?? undefined, active: true });
    } catch (problem) { setOpenError(problem instanceof Error ? problem.message : '无法打开书签'); }
  }

  return <section className="bookmarks-page">
    <header><h1>书签</h1><input aria-label="搜索书签" placeholder="搜索书签" value={query} onChange={event => setQuery(event.target.value)} />
      <button disabled={bookmarks.pending} onClick={() => setEditor({ kind: 'bookmark' })}>添加书签</button>
      <button disabled={bookmarks.pending} onClick={() => setEditor({ kind: 'folder' })}>新建文件夹</button></header>
    {(bookmarks.error || openError) && <div className="bookmark-error" role="alert">{bookmarks.error || openError}
      <button onClick={() => void bookmarks.refresh()}>重新加载</button></div>}
    <div className="bookmark-browser">
      <BookmarkFolderTree nodes={bookmarks.nodes} selectedId={activeFolderId} onSelect={id => { setFolderId(id); setQuery(''); }} />
      <main><h2>{term ? `搜索结果 · ${visible.length}` : selectedFolder?.title ?? '书签栏'}</h2>
        {bookmarks.revision < 0 ? <p>正在读取书签…</p> : !visible.length ? <p className="bookmark-empty">{term ? '没有找到匹配的书签' : '在此保存常用网站，或添加文件夹进行整理'}</p> : <ul className="bookmark-list">
          {visible.map((node, index) => <li key={node.id}>
            <button className="bookmark-open" onClick={() => void open(node)}>
              <span className="bookmark-kind" aria-hidden="true">{node.kind === 'folder' ? '▱' : '☆'}</span>
              <span><strong>{node.title}</strong>{node.url && <small>{node.url}</small>}</span>
            </button>
            <div className="bookmark-actions">
              {!term && <><button aria-label={`上移 ${node.title}`} disabled={index === 0 || bookmarks.pending}
                onClick={() => void bookmarks.mutate('bookmarks.move', { id: node.id, parentId: node.parentId, index: index - 1 })}>↑</button>
                <button aria-label={`下移 ${node.title}`} disabled={index === visible.length - 1 || bookmarks.pending}
                  onClick={() => void bookmarks.mutate('bookmarks.move', { id: node.id, parentId: node.parentId, index: index + 1 })}>↓</button></>}
              <button disabled={bookmarks.pending} onClick={() => setEditor({ kind: node.kind, node })}>编辑</button>
              <button disabled={bookmarks.pending} onClick={() => setMoving(node)}>移动</button>
              <button disabled={bookmarks.pending} onClick={() => setDeleting(node)}>删除</button>
            </div>
          </li>)}
        </ul>}
      </main>
    </div>
    {editor && <BookmarkDialog key={editor.node?.id ?? editor.kind} node={editor.node} kind={editor.kind}
      parentId={activeFolderId} folders={folders} pending={bookmarks.pending} error={bookmarks.error} onSave={save} onClose={() => setEditor(null)} />}
    {moving && <BookmarkMoveDialog node={moving} nodes={bookmarks.nodes} pending={bookmarks.pending} error={bookmarks.error}
      onClose={() => setMoving(null)} onMove={async parentId => {
        if (await bookmarks.mutate('bookmarks.move', { id: moving.id, parentId, index: bookmarks.nodes.filter(node => node.parentId === parentId).length })) setMoving(null);
      }} />}
    {deleting && <div className="bookmark-dialog-backdrop"><section className="bookmark-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bookmark-delete-title">
      <h2 id="bookmark-delete-title">删除“{deleting.title}”？</h2>
      <p>{deleting.kind === 'folder' ? '此文件夹及其中所有书签将被删除。' : '此书签将从当前资料中删除。'}</p>
      {bookmarks.error && <p role="alert">{bookmarks.error}</p>}
      <footer><button disabled={bookmarks.pending} onClick={() => setDeleting(null)}>取消</button>
        <button disabled={bookmarks.pending} onClick={async () => {
          if (await bookmarks.mutate('bookmarks.remove', { id: deleting.id })) setDeleting(null);
        }}>删除</button></footer>
    </section></div>}
  </section>;
}
