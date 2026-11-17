import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, RotateCw, X } from 'lucide-react';
import type { TabSnapshot } from '../../shared/contracts/browser-core';
import { IconButton } from '../components/icon-button';
import { AddressBar } from './address-bar';
import { BrowserMenu } from './browser-menu';
import { ProfileMenu } from './profile-menu';
import { useBrowserCommand } from './use-browser-command';

export function Toolbar({ tab, slots }: { tab: TabSnapshot | undefined; slots?: ReactNode }) {
  const command = useBrowserCommand();
  return (
    <div className="browser-toolbar">
      <IconButton label="后退" disabled={!tab?.canGoBack}
        onClick={() => tab && void command('browser.back', { tabId: tab.id })}><ArrowLeft size={18} /></IconButton>
      <IconButton label="前进" disabled={!tab?.canGoForward}
        onClick={() => tab && void command('browser.forward', { tabId: tab.id })}><ArrowRight size={18} /></IconButton>
      <IconButton label={tab?.loading ? '停止加载' : '重新加载'} disabled={!tab}
        onClick={() => tab && void command(tab.loading ? 'browser.stop' : 'browser.reload', { tabId: tab.id })}>
        {tab?.loading ? <X size={17} /> : <RotateCw size={17} />}
      </IconButton>
      <AddressBar tab={tab} />
      <IconButton label="将此页加入收藏" disabled={!tab || tab.url.startsWith('brave:')}
        onClick={() => tab && void command('bookmarks.addCurrentTab', { tabId: tab.id, parentId: null })}>
        <Bookmark size={17} />
      </IconButton>
      {slots}
      <ProfileMenu />
      <BrowserMenu />
    </div>
  );
}
