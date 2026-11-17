import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Bookmark, Download, FolderOpen, Gift, History, Menu as MenuIcon, Monitor, PanelLeft, Plus, Printer, Puzzle, RefreshCw, Search, Settings, Shield, Undo2, VenetianMask, Wallet } from 'lucide-react';
import { IconButton } from '../components/icon-button';
import { useBrowserCommand } from './use-browser-command';
import { useBrowserStore } from './browser-store';
import { usePageOverlay } from './use-page-overlay';
import { ZoomControls } from './zoom-controls';

export function BrowserMenu() {
  const [open, setOpen] = useState(false);
  const command = useBrowserCommand();
  const snapshot = useBrowserStore((state) => state.snapshot);
  const current = snapshot?.windows.find((entry) => entry.id === snapshot.currentWindowId);
  usePageOverlay(open);
  const pages = [
    { url: 'brave://bookmarks', label: '收藏夹', icon: Bookmark },
    { url: 'brave://history', label: '历史记录', icon: History },
    { url: 'brave://downloads', label: '下载内容', icon: Download },
    { url: 'brave://settings', label: '设置', icon: Settings },
    { url: 'brave://sync', label: '同步', icon: RefreshCw },
    { url: 'brave://privacy', label: '隐私与安全', icon: Shield },
    { url: 'brave://extensions', label: '扩展', icon: Puzzle },
    { url: 'brave://wallet', label: 'Brave Wallet', icon: Wallet },
    { url: 'brave://rewards', label: 'Brave Rewards', icon: Gift },
  ];
  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger render={<IconButton label="主菜单" />}><MenuIcon size={19} /></Menu.Trigger>
      <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={8}>
        <Menu.Popup className="browser-menu">
          <Menu.Item onClick={() => void command('browser.openTab', {})}><Plus size={16} />新建标签页<kbd>⌘T</kbd></Menu.Item>
          <Menu.Item onClick={() => void command('browser.openWindow', {})}><Monitor size={16} />新建窗口<kbd>⌘N</kbd></Menu.Item>
          <Menu.Item onClick={() => void command('browser.openWindow', { isPrivate: true })}><VenetianMask size={16} />新建私密窗口<kbd>⇧⌘N</kbd></Menu.Item>
          <Menu.Item onClick={() => void command('browser.reopenClosedTab', {})}><Undo2 size={16} />重新打开关闭的标签页</Menu.Item>
          <Menu.Item onClick={() => void command('browser.openFile', {})}><FolderOpen size={16} />打开文件<kbd>⌘O</kbd></Menu.Item>
          <Menu.Separator className="menu-separator" />
          <ZoomControls tabId={current?.activeTabId ?? undefined} active={open} />
          <Menu.Item onClick={() => window.dispatchEvent(new Event('brave:find-page'))}><Search size={16} />在页面中查找<kbd>⌘F</kbd></Menu.Item>
          <Menu.Item disabled={!current?.activeTabId} onClick={() => current?.activeTabId && void command('browser.print', { tabId: current.activeTabId })}><Printer size={16} />打印<kbd>⌘P</kbd></Menu.Item>
          <Menu.Separator className="menu-separator" />
          {pages.map(({ url, label, icon: Icon }) => (
            <Menu.Item key={url} onClick={() => void command('browser.openTab', { url })}><Icon size={16} />{label}</Menu.Item>
          ))}
          <Menu.Separator className="menu-separator" />
          <Menu.Item onClick={() => void command('browser.setLayout', { verticalTabs: !current?.layout.verticalTabs })}>
            <PanelLeft size={16} />{current?.layout.verticalTabs ? '使用横向标签页' : '使用纵向标签页'}
          </Menu.Item>
        </Menu.Popup>
      </Menu.Positioner></Menu.Portal>
    </Menu.Root>
  );
}
