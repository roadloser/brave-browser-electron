import type { ReactNode } from 'react';
import { Bookmark, Download, History, Settings } from 'lucide-react';
import { IconButton } from '../components/icon-button';
import { useBrowserCommand } from './use-browser-command';

export function Sidebar({ slots }: { slots?: ReactNode }) {
  const command = useBrowserCommand();
  return (
    <aside className="browser-sidebar" aria-label="侧栏">
      <IconButton label="收藏夹" onClick={() => void command('browser.openTab', { url: 'brave://bookmarks' })}><Bookmark size={18} /></IconButton>
      <IconButton label="历史记录" onClick={() => void command('browser.openTab', { url: 'brave://history' })}><History size={18} /></IconButton>
      <IconButton label="下载内容" onClick={() => void command('browser.openTab', { url: 'brave://downloads' })}><Download size={18} /></IconButton>
      {slots}
      <div className="sidebar-spacer" />
      <IconButton label="设置" onClick={() => void command('browser.openTab', { url: 'brave://settings' })}><Settings size={18} /></IconButton>
    </aside>
  );
}
