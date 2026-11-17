import { useState } from 'react';
import { Folder, Globe, MoreHorizontal } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import type { BookmarkNode } from '../../../shared/contracts/bookmarks';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { useBookmarks } from './use-bookmarks';
import './bookmarks.css';

export function BookmarksBar({ tab }: { tab?: TabSnapshot }) {
  const bookmarks = useBookmarks();
  const [folder, setFolder] = useState<BookmarkNode | null>(null);
  const [error, setError] = useState('');
  const entries = bookmarks.nodes.filter(node => node.parentId === 'bookmarks-bar').sort((left, right) => left.position - right.position);
  const children = folder ? bookmarks.nodes.filter(node => node.parentId === folder.id).sort((left, right) => left.position - right.position) : [];

  async function open(node: BookmarkNode) {
    if (node.kind === 'folder') { setFolder(node); return; }
    if (!node.url) return;
    try {
      setError('');
      if (tab) await browserClient.command('browser.navigate', { tabId: tab.id, url: node.url });
      else await browserClient.command('browser.openTab', { url: node.url, active: true });
      setFolder(null);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '无法打开书签'); }
  }

  return <nav className="bookmarks-bar" aria-label="书签栏">
    {!entries.length && <span className="bookmarks-bar-empty">将常用网站保存到书签栏，即可从这里访问。</span>}
    {entries.map(node => <button key={node.id} title={node.url ?? node.title} onClick={() => void open(node)}>
      {node.kind === 'folder' ? <Folder size={14} /> : <Globe size={14} />}<span>{node.title}</span>
    </button>)}
    <button className="bookmarks-bar-manage" title="管理书签" onClick={() => void browserClient.command('browser.openTab', { url: 'brave://bookmarks', active: true }).catch(problem => setError(problem instanceof Error ? problem.message : '无法打开书签管理器'))}>
      <MoreHorizontal size={16} />
    </button>
    {error && <span role="alert">{error}</span>}
    {folder && <Modal open title={folder.title} className="bookmark-dialog" onOpenChange={visible => { if (!visible) setFolder(null); }}>
      {folder.parentId && folder.parentId !== 'bookmarks-bar' && <button onClick={() => setFolder(bookmarks.nodes.find(node => node.id === folder.parentId) ?? null)}>返回上级</button>}
      {!children.length ? <p>此文件夹为空</p> : <ul className="bookmark-folder-popup">
        {children.map(node => <li key={node.id}><button onClick={() => void open(node)}>
          {node.kind === 'folder' ? <Folder size={16} /> : <Globe size={16} />}{node.title}
        </button></li>)}
      </ul>}
      {error && <p role="alert">{error}</p>}
    </Modal>}
  </nav>;
}
