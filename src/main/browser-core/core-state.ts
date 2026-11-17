import type { BrowserWindow, WebContentsView, NavigationEntry } from 'electron';
import type { BrowserContext, BrowserLayout, TabSnapshot } from '../../shared/contracts/browser-core';

export type TabRecord = {
  snapshot: TabSnapshot;
  view: WebContentsView;
  disposeEvents: () => void;
  source: 'navigation' | 'reload' | 'history' | 'same-document';
};
export type WindowRecord = {
  id: string;
  ready: boolean;
  context: BrowserContext;
  native: BrowserWindow;
  tabIds: string[];
  activeTabId: string | null;
  layout: BrowserLayout;
};
export type SavedTab = {
  id: string; url: string; title: string; pinned: boolean; muted: boolean;
  entries: NavigationEntry[]; activeIndex: number;
};
export type SavedWindow = {
  id: string; profileId: string; activeTabId: string | null;
  tabs: SavedTab[]; layout: BrowserLayout;
  bounds: { x: number; y: number; width: number; height: number };
  maximized: boolean;
};

export function defaultLayout(): BrowserLayout {
  return {
    viewport: { x: 0, y: 88, width: 1280, height: 712 },
    verticalTabs: false, splitTabIds: [], splitRatio: 0.5,
    sidebarTabId: null, sidebarWidth: 320, contentVisible: true,
  };
}
