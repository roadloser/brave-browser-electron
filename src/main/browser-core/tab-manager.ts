import { WebContentsView } from 'electron';
import { randomUUID } from 'node:crypto';
import { BrowserError } from '../../shared/errors';
import type { TabSnapshot } from '../../shared/contracts/browser-core';
import type { SavedTab, TabRecord, WindowRecord } from './core-state';
import { SessionRegistry } from './session-registry';
import { NavigationController } from './navigation-controller';
import { nativeUrl } from './internal-pages';

export class TabManager {
  readonly records = new Map<string, TabRecord>();
  private readonly closed = new Map<string, SavedTab[]>();

  constructor(
    private readonly sessions: SessionRegistry,
    private readonly navigation: NavigationController,
    private readonly changed: (window: WindowRecord) => void,
    private readonly popup: (windowId: string, url: string) => void,
  ) {}

  async create(window: WindowRecord, options: { url?: string; active?: boolean; pinned?: boolean }, saved?: SavedTab): Promise<TabSnapshot> {
    const view = new WebContentsView({ webPreferences: {
      session: this.sessions.get(window.context), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true,
      allowRunningInsecureContent: false,
    } });
    const snapshot: TabSnapshot = {
      ...window.context, id: saved?.id ?? randomUUID(), windowId: window.id,
      url: saved?.url ?? options.url ?? 'brave://newtab', title: saved?.title ?? '新标签页',
      loading: false, canGoBack: false, canGoForward: false,
      pinned: saved?.pinned ?? options.pinned ?? false, muted: saved?.muted ?? false,
      audible: false, crashed: false, navigationId: randomUUID(), revision: 0,
    };
    const tab: TabRecord = { snapshot, view, disposeEvents: () => undefined, source: 'navigation' };
    this.records.set(snapshot.id, tab);
    window.tabIds.push(snapshot.id);
    if (snapshot.pinned) this.move(window, snapshot.id, window.tabIds.filter(tabId => this.get(tabId).snapshot.pinned).length - 1);
    window.native.contentView.addChildView(view);
    view.setVisible(false);
    view.webContents.setAudioMuted(snapshot.muted);
    tab.disposeEvents = this.navigation.bind(tab);
    view.webContents.setWindowOpenHandler(details => {
      if (/^https?:/i.test(details.url)) this.popup(window.id, details.url);
      return { action: 'deny' };
    });
    view.webContents.on('will-attach-webview', event => event.preventDefault());
    if (options.active !== false || !window.activeTabId) window.activeTabId = snapshot.id;
    this.changed(window);
    try {
      if (saved?.entries.length) {
        await view.webContents.navigationHistory.restore({ entries: saved.entries, index: Math.min(saved.activeIndex, saved.entries.length - 1) });
      } else await this.navigation.navigate(tab, snapshot.url);
    } catch (error) {
      tab.snapshot.error = error instanceof Error ? error.message : '无法恢复此标签';
      this.changed(window);
    }
    return { ...snapshot };
  }

  get(tabId: string): TabRecord {
    const tab = this.records.get(tabId);
    if (!tab || tab.view.webContents.isDestroyed()) throw new BrowserError('NOT_FOUND', '标签已关闭');
    return tab;
  }

  select(window: WindowRecord, tabId: string): void {
    const tab = this.get(tabId);
    if (tab.snapshot.windowId !== window.id) throw new BrowserError('FORBIDDEN', '标签不属于当前窗口');
    window.activeTabId = tabId;
    this.changed(window);
    tab.view.webContents.focus();
  }

  close(window: WindowRecord, tabId: string, remember = true): void {
    const tab = this.get(tabId);
    if (remember) {
      const history = this.closed.get(window.id) ?? [];
      history.unshift(this.save(tabId));
      this.closed.set(window.id, history.slice(0, 25));
    }
    const index = window.tabIds.indexOf(tabId);
    window.tabIds.splice(index, 1);
    if (window.activeTabId === tabId) window.activeTabId = window.tabIds[Math.min(index, window.tabIds.length - 1)] ?? null;
    window.layout.splitTabIds = window.layout.splitTabIds.filter(id => id !== tabId);
    if (window.layout.splitTabIds.length < 2) window.layout.splitTabIds = [];
    if (window.layout.sidebarTabId === tabId) window.layout.sidebarTabId = null;
    tab.disposeEvents();
    if (!window.native.isDestroyed()) window.native.contentView.removeChildView(tab.view);
    this.records.delete(tabId);
    tab.view.webContents.close({ waitForBeforeUnload: false });
    this.changed(window);
  }

  move(window: WindowRecord, tabId: string, index: number): void {
    const tab = this.get(tabId);
    window.tabIds = window.tabIds.filter(id => id !== tabId);
    const pinnedCount = window.tabIds.filter(id => this.get(id).snapshot.pinned).length;
    const position = tab.snapshot.pinned ? Math.min(index, pinnedCount) : Math.max(index, pinnedCount);
    window.tabIds.splice(Math.min(position, window.tabIds.length), 0, tabId);
    this.changed(window);
  }

  save(tabId: string): SavedTab {
    const tab = this.get(tabId);
    const history = tab.view.webContents.navigationHistory;
    return {
      id: tabId, url: tab.snapshot.url, title: tab.snapshot.title,
      pinned: tab.snapshot.pinned, muted: tab.snapshot.muted,
      entries: history.getAllEntries(), activeIndex: Math.max(0, history.getActiveIndex()),
    };
  }

  async reopen(window: WindowRecord): Promise<TabSnapshot | null> {
    const saved = this.closed.get(window.id)?.shift();
    if (!saved) return null;
    return this.create(window, { active: true }, { ...saved, id: randomUUID() });
  }

  async duplicate(window: WindowRecord, tabId: string): Promise<TabSnapshot> {
    return this.create(window, { active: true }, { ...this.save(tabId), id: randomUUID() });
  }

  forgetWindow(windowId: string): void { this.closed.delete(windowId); }
}
