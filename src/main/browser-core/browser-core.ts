import type { BrowserContext, BrowserLayout, BrowserSnapshot, CoreEvent, TabSnapshot, WindowSnapshot } from '../../shared/contracts/browser-core';
import type { BrowserCorePort, StorageHost } from '../../shared/runtime-ports';
import { BrowserError } from '../../shared/errors';
import { ProfileManager } from './profile-manager';
import { PageEventSource } from './page-event-source';
import { SessionRegistry } from './session-registry';
import { WindowManager } from './window-manager';
import { TabManager } from './tab-manager';
import { NavigationController } from './navigation-controller';
import { LayoutController } from './layout-controller';
import { RecoveryRepository } from './recovery-repository';
import { CoreRecovery } from './core-recovery';
import type { SavedWindow, WindowRecord } from './core-state';

export type BrowserCoreOptions = {
  storage: StorageHost; uiUrl: string; preloadPath: string;
  onError?: (error: unknown) => void;
};

export class BrowserCore implements BrowserCorePort {
  private readonly profiles = new ProfileManager();
  private readonly events = new PageEventSource();
  private readonly sessions = new SessionRegistry(this.events);
  private readonly windows: WindowManager;
  private readonly tabs: TabManager;
  private readonly navigation: NavigationController;
  private readonly layout: LayoutController;
  private readonly repository: RecoveryRepository;
  private readonly recovery: CoreRecovery;
  private revision = 0;
  private quitting = false;
  private restoring = false;

  constructor(private readonly options: BrowserCoreOptions) {
    this.repository = new RecoveryRepository(options.storage);
    this.windows = new WindowManager({
      ...options, onClosed: window => this.windowClosed(window),
      onChanged: window => this.changed(window),
    });
    this.navigation = new NavigationController(
      tab => {
        const window = this.windows.records.get(tab.snapshot.windowId);
        if (window) this.changed(window);
      },
      visit => this.events.emit({ type: 'navigationCommitted', visit }),
    );
    this.tabs = new TabManager(this.sessions, this.navigation, window => this.changed(window),
      (windowId, url) => { void this.openTab({ windowId, url }).catch(error => this.reportError(error)); });
    this.layout = new LayoutController(tabId => this.tabs.get(tabId));
    this.recovery = new CoreRecovery(this.profiles, this.windows, this.tabs, this.repository, error => this.reportError(error));
  }

  getState(windowId: string): BrowserSnapshot {
    const requester = this.windows.get(windowId);
    return {
      profiles: this.profiles.list(),
      windows: [...this.windows.records.values()]
        .filter(window => window.context.contextId === requester.context.contextId)
        .map(window => this.getWindow(window.id)),
      currentWindowId: windowId, revision: this.revision,
    };
  }

  getWindow(windowId: string): WindowSnapshot {
    const window = this.windows.get(windowId);
    return {
      ...window.context, id: window.id,
      tabs: window.tabIds.map(tabId => this.getTab(tabId)), activeTabId: window.activeTabId,
      layout: structuredClone(window.layout), maximized: window.native.isMaximized(),
      fullscreen: window.native.isFullScreen(), revision: this.revision,
    };
  }

  getTab(tabId: string): TabSnapshot { return { ...this.tabs.get(tabId).snapshot }; }
  getWindowForSender(webContentsId: number) {
    const window = this.windows.sender(webContentsId);
    return window ? this.getWindow(window.id) : undefined;
  }
  getNativeWindow(windowId: string) { return this.windows.get(windowId).native; }
  getTabWebContents(tabId: string) { return this.tabs.get(tabId).view.webContents; }
  sessionForContext(context: BrowserContext) { return this.sessions.get(context); }
  getContexts() { return this.sessions.contexts(); }
  onEvent(listener: (event: CoreEvent) => void) { return this.events.subscribe(listener); }

  async openWindow(options: { profileId?: string; isPrivate?: boolean } = {}): Promise<WindowSnapshot> {
    const profile = this.profiles.get(options.profileId);
    const window = await this.createWindow(profile.id, options.isPrivate ?? false);
    await this.openTab({ windowId: window.id });
    return this.getWindow(window.id);
  }

  closeWindow(windowId: string): void { this.windows.get(windowId).native.close(); }
  async openTab(options: { windowId: string; url?: string; active?: boolean; pinned?: boolean }) {
    return this.tabs.create(this.windows.get(options.windowId), options);
  }
  selectTab(tabId: string): void { this.tabs.select(this.windowForTab(tabId), tabId); }
  closeTab(tabId: string): void {
    const window = this.windowForTab(tabId);
    this.tabs.close(window, tabId);
    this.events.emit({ type: 'tabClosed', context: window.context, windowId: window.id, tabId });
    if (!window.tabIds.length) this.closeWindow(window.id);
  }
  navigate(tabId: string, input: string) { return this.navigation.navigate(this.tabs.get(tabId), input); }
  goBack(tabId: string): void {
    const tab = this.tabs.get(tabId); tab.source = 'history';
    if (tab.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
  }
  goForward(tabId: string): void {
    const tab = this.tabs.get(tabId); tab.source = 'history';
    if (tab.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward();
  }
  reload(tabId: string, bypassCache = false): void {
    const tab = this.tabs.get(tabId); tab.source = 'reload';
    if (bypassCache) tab.view.webContents.reloadIgnoringCache(); else tab.view.webContents.reload();
  }
  stop(tabId: string): void { this.getTabWebContents(tabId).stop(); }
  moveTab(tabId: string, index: number): void { this.tabs.move(this.windowForTab(tabId), tabId, index); }
  pinTab(tabId: string, pinned: boolean): void {
    const tab = this.tabs.get(tabId); tab.snapshot.pinned = pinned;
    this.tabs.move(this.windowForTab(tabId), tabId, pinned ? 0 : this.windowForTab(tabId).tabIds.length);
  }
  muteTab(tabId: string, muted: boolean): void {
    const tab = this.tabs.get(tabId); tab.snapshot.muted = muted;
    tab.view.webContents.setAudioMuted(muted); this.changed(this.windowForTab(tabId));
  }
  duplicateTab(tabId: string) { return this.tabs.duplicate(this.windowForTab(tabId), tabId); }
  reopenClosedTab(windowId: string) { return this.tabs.reopen(this.windows.get(windowId)); }
  setLayout(windowId: string, layout: Partial<BrowserLayout>): void {
    const window = this.windows.get(windowId); this.layout.update(window, layout); this.changed(window);
  }
  windowAction(windowId: string, action: 'minimize' | 'maximize' | 'restore' | 'close'): void {
    const window = this.windows.get(windowId).native;
    if (action === 'restore') window.unmaximize(); else window[action]();
  }

  async restore(): Promise<void> {
    this.restoring = true;
    try {
      for (const profile of this.profiles.list()) {
        for (const saved of this.repository.read(profile.id)) {
          const window = await this.createWindow(profile.id, false, saved);
          for (const tab of saved.tabs) await this.tabs.create(window, { active: false }, tab);
          if (saved.activeTabId && window.tabIds.includes(saved.activeTabId)) window.activeTabId = saved.activeTabId;
          if (!window.tabIds.length) await this.openTab({ windowId: window.id });
          this.changed(window);
        }
      }
      if (!this.windows.records.size) await this.openWindow();
    } finally { this.restoring = false; }
    this.recovery.schedule();
  }

  async dispose(): Promise<void> {
    if (this.quitting) return;
    this.recovery.flush();
    this.quitting = true;
    this.recovery.suspend();
    for (const window of [...this.windows.records.values()]) window.native.destroy();
    await this.sessions.dispose();
    this.events.dispose();
  }

  private async createWindow(profileId: string, isPrivate: boolean, saved?: SavedWindow) {
    const context = this.sessions.acquire(profileId, isPrivate);
    try { return await this.windows.create(context, saved); }
    catch (error) { await this.sessions.release(context); throw error; }
  }
  private windowForTab(tabId: string) { return this.windows.get(this.tabs.get(tabId).snapshot.windowId); }
  private changed(window: WindowRecord): void {
    if (window.native.isDestroyed() || this.quitting) return;
    this.revision += 1;
    this.layout?.apply(window);
    if (!this.restoring) this.recovery?.schedule();
    for (const target of this.windows.records.values()) {
      if (target.native.isDestroyed()) continue;
      this.events.emit({ type: 'stateChanged', windowId: target.id, state: this.getState(target.id) });
    }
  }
  private windowClosed(window: WindowRecord): void {
    for (const tabId of [...window.tabIds]) {
      if (this.tabs.records.has(tabId)) {
        this.tabs.close(window, tabId, false);
        this.events.emit({ type: 'tabClosed', context: window.context, windowId: window.id, tabId });
      }
    }
    this.tabs.forgetWindow(window.id);
    void this.sessions.release(window.context).catch(error => this.reportError(error));
    if (!this.quitting && !this.restoring) this.recovery.schedule();
  }
  private reportError(error: unknown): void {
    this.options.onError?.(error instanceof BrowserError ? error : new BrowserError('INTERNAL', '浏览器核心操作失败'));
  }
}
