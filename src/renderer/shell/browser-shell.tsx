import type { ReactNode } from 'react';
import { LoaderCircle, VenetianMask } from 'lucide-react';
import type { TabSnapshot, WindowSnapshot } from '../../shared/contracts/browser-core';
import { useTabGroups } from '../../features/tab-groups/renderer/group-store';
import { ErrorNotice } from '../components/error-notice';
import { useBrowserEvents } from './use-browser-events';
import { useBrowserStore } from './browser-store';
import { useBrowserShortcuts } from './use-browser-shortcuts';
import { Toolbar } from './toolbar';
import { TabStrip } from './tab-strip';
import { VerticalTabStrip } from './vertical-tab-strip';
import { ContentViewport } from './content-viewport';
import { Sidebar } from './sidebar';
import { SplitControls } from './split-controls';
import { useShellSettings } from './use-shell-settings';
import '../styles/tokens.css';
import '../styles/theme.css';
import '../styles/shell.css';

export interface BrowserShellProps {
  renderPage: (url: string, context: { window: WindowSnapshot; tab: TabSnapshot }) => ReactNode;
  toolbarSlots?: ReactNode;
  sidebarSlots?: ReactNode;
  bookmarksBarSlot?: ReactNode;
}

export function BrowserShell({ renderPage, toolbarSlots, sidebarSlots, bookmarksBarSlot }: BrowserShellProps) {
  useBrowserEvents();
  const snapshot = useBrowserStore((state) => state.snapshot);
  const error = useBrowserStore((state) => state.error);
  const currentWindow = snapshot?.windows.find((entry) => entry.id === snapshot.currentWindowId);
  const tab = currentWindow?.tabs.find((entry) => entry.id === currentWindow.activeTabId);
  const groups = useTabGroups(currentWindow?.ready ? currentWindow.id : undefined);
  useShellSettings(currentWindow?.profileId);
  useBrowserShortcuts(currentWindow);
  if (!currentWindow?.ready) return (
    <div className="browser-loading">
      <LoaderCircle size={24} className="spinning" /><span>正在恢复浏览器…</span>
      {error && <ErrorNotice message={error} />}
    </div>
  );
  const internal = Boolean(tab?.url.startsWith('brave:'));
  return (
    <div className="browser-shell" data-private={currentWindow.isPrivate} data-vertical={currentWindow.layout.verticalTabs}>
      <header className="browser-titlebar">
        <div className="window-drag-area" />
        {currentWindow.layout.verticalTabs ? <span className="window-title">{tab?.title || 'Brave'}</span> :
          <TabStrip currentWindow={currentWindow} groups={groups} />}
        {currentWindow.isPrivate && <span className="private-badge"><VenetianMask size={16} />私密</span>}
      </header>
      <Toolbar tab={tab} slots={toolbarSlots} />
      {bookmarksBarSlot}
      {error && <ErrorNotice message={error} onDismiss={() => useBrowserStore.getState().clearError()} />}
      <div className="browser-workspace">
        {currentWindow.layout.verticalTabs && <VerticalTabStrip currentWindow={currentWindow} groups={groups} />}
        <div className="browser-content-stack">
          <SplitControls currentWindow={currentWindow} />
          <ContentViewport currentWindow={currentWindow} internal={internal || Boolean(tab?.error || tab?.crashed)}>
            {tab && internal ? renderPage(tab.url, { window: currentWindow, tab }) : null}
            {tab?.error && <div className="navigation-error"><ErrorNotice message={tab.error} /></div>}
          </ContentViewport>
        </div>
        <Sidebar slots={sidebarSlots} />
      </div>
    </div>
  );
}
