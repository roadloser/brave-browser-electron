import type { BrowserContext, BrowserLayout, BrowserSnapshot, CoreEvent, TabSnapshot, WindowSnapshot } from '../../shared/contracts/browser-core';
import type { BrowserCorePort, StorageHost } from '../../shared/runtime-ports';
import type { BrowserSettings } from '../../shared/contracts/settings';
import { dialog, session } from 'electron';
import { pathToFileURL } from 'node:url';
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
import { AuxiliaryViewManager } from './auxiliary-view-manager';
import type { Rectangle } from '../../shared/contracts/browser-core';
import { clearExtensionStorage } from './extension-storage';
import { PageActions } from './page-actions';
import { NavigationPreparation } from './navigation-preparation';
import { TorWindowController } from './tor-window-controller';

export type BrowserCoreOptions = {
  storage: StorageHost; uiUrl: string; preloadPath: string;
  onProfileReady?: (profileId: string) => void;
  onError?: (error: unknown) => void;
};

export class BrowserCore implements BrowserCorePort {
  private readonly profiles: ProfileManager;
  private readonly events = new PageEventSource();
  private readonly sessions = new SessionRegistry(this.events);
  private readonly auxiliaryViews = new AuxiliaryViewManager(this.sessions);
  private readonly pageActions = new PageActions(this);
  private readonly navigationPreparation = new NavigationPreparation();
  private readonly windows: WindowManager;
  private readonly tabs: TabManager;
  private readonly navigation: NavigationController;
  private readonly layout: LayoutController;
  private readonly repository: RecoveryRepository;
  private readonly recovery: CoreRecovery;
  private readonly torWindows: TorWindowController;
  private revision = 0;
  private quitting = false;
  private restoring = false;
  private readonly preferences = new Map<string, Pick<BrowserSettings, 'startup' | 'searchEngine' | 'verticalTabs'>>();

  constructor(private readonly options: BrowserCoreOptions) {
    this.profiles = new ProfileManager(options.storage);
    this.repository = new RecoveryRepository(options.storage);
    this.windows = new WindowManager({
      ...options, onClosed: window => this.windowClosed(window),
      onChanged: window => this.changed(window),
      onBeforeClose: window => {
        if (this.quitting || !window.tabIds.length) return true;
        for (const tabId of [...window.tabIds]) this.closeTab(tabId);
        return false;
      },
    });
    this.navigation = new NavigationController(
      tab => {
        const window = this.windows.records.get(tab.snapshot.windowId);
        if (window) this.changed(window);
      },
      visit => this.events.emit({ type: 'navigationCommitted', visit }),
      profileId => this.preferences.get(profileId)?.searchEngine ?? 'brave',
      (windowId, result) => this.events.emit({ type: 'findResult', windowId, result }),
      this.navigationPreparation,
    );
    this.tabs = new TabManager(this.sessions, this.navigation, window => this.changed(window),
      (windowId, url) => { void this.openTab({ windowId, url }).catch(error => this.reportError(error)); });
    this.layout = new LayoutController(tabId => this.tabs.get(tabId));
    this.recovery = new CoreRecovery(this.profiles, this.windows, this.tabs, this.repository, error => this.reportError(error));
    this.torWindows = new TorWindowController(this.sessions, this.windows, this.events, async window => {
      await this.openTab({ windowId: window.id });
      this.ready(window);
      return this.getWindow(window.id);
    }, profileId => { this.profiles.get(profileId); this.options.onProfileReady?.(profileId); });
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
      ready: window.ready,
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
  openAuxiliaryView(windowId: string, options: { kind: 'extension-popup'; url: string; bounds: Rectangle }) {
    return this.auxiliaryViews.open(this.windows.get(windowId), options);
  }
  closeAuxiliaryView(viewId: string): void { this.auxiliaryViews.close(viewId); }
  clearExtensionStorage(windowId: string, extensionId: string): Promise<void> {
    return clearExtensionStorage(this.sessions.get(this.windows.get(windowId).context), extensionId);
  }
  sessionForContext(context: BrowserContext) { return this.sessions.get(context); }
  getContexts() { return this.sessions.contexts(); }
  getProfiles() { return this.profiles.list(); }
  configureProfile(profileId: string, settings: Pick<BrowserSettings, 'startup' | 'searchEngine' | 'verticalTabs'>): void {
    this.profiles.get(profileId);
    this.preferences.set(profileId, { ...settings });
    for (const window of this.windows.records.values()) {
      if (window.context.profileId === profileId) {
        window.layout.verticalTabs = settings.verticalTabs;
        this.changed(window);
      }
    }
  }
  onEvent(listener: (event: CoreEvent) => void) { return this.events.subscribe(listener); }
  registerBeforeNavigate(id: string, prepare: (tab: TabSnapshot) => Promise<void>) { return this.navigationPreparation.register(id, prepare); }

  async openWindow(options: { profileId?: string; isPrivate?: boolean } = {}): Promise<WindowSnapshot> {
    const profile = this.profiles.get(options.profileId);
    const window = await this.createWindow(profile.id, options.isPrivate ?? false);
    await this.openTab({ windowId: window.id });
    this.ready(window);
    return this.getWindow(window.id);
  }

  closeWindow(windowId: string): void { this.windows.get(windowId).native.close(); }
  openTorWindow(profileId: string, prepare: (context: BrowserContext, browserSession: Electron.Session) => Promise<void>) { return this.torWindows.open(profileId, prepare); }
  closeContext(contextId: string): Promise<void> { return this.torWindows.closeContext(contextId); }
  createProfile(name: string) {
    const profile = this.profiles.create(name);
    this.options.onProfileReady?.(profile.id);
    this.broadcast();
    return profile;
  }
  renameProfile(profileId: string, name: string) {
    const profile = this.profiles.rename(profileId, name);
    this.broadcast();
    return profile;
  }
  async deleteProfile(profileId: string, confirmName: string): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (profile.isDefault) throw new BrowserError('FORBIDDEN', '不能删除默认资料');
    if (profile.name !== confirmName) throw new BrowserError('INVALID_ARGUMENT', '请输入完整资料名称以确认删除');
    if (this.sessions.contexts().some(context => context.profileId === profileId)) {
      throw new BrowserError('CONFLICT', '请先关闭此资料的全部窗口');
    }
    const browserSession = session.fromPartition('persist:profile-' + profileId);
    await browserSession.closeAllConnections();
    await browserSession.clearStorageData();
    await browserSession.clearCache();
    this.options.storage.remove(profileId);
    this.profiles.remove(profileId);
    this.broadcast();
  }
  async openTab(options: { windowId: string; url?: string; active?: boolean; pinned?: boolean }) {
    return this.tabs.create(this.windows.get(options.windowId), options);
  }
  async openFile(windowId: string): Promise<TabSnapshot | null> {
    const result = await dialog.showOpenDialog(this.getNativeWindow(windowId), { title: '打开文件', properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const tab = await this.openTab({ windowId, url: 'about:blank' });
    await this.navigation.openLocalFile(this.tabs.get(tab.id), pathToFileURL(result.filePaths[0]).href);
    return this.getTab(tab.id);
  }
  getSyncTabs(profileId: string) {
    return { windows: [...this.windows.records.values()].filter(window => window.ready && !window.context.isPrivate && window.context.profileId === profileId).map(window => ({
      id: window.id, activeTabId: window.activeTabId,
      tabs: window.tabIds.map(tabId => {
        const saved = this.tabs.save(tabId);
        const allowed = saved.entries.map((entry, index) => ({ entry, index })).filter(value => /^https?:/i.test(value.entry.url));
        return { id: tabId, url: saved.url, title: saved.title, pinned: saved.pinned,
          navigation: allowed.map(value => ({ url: value.entry.url, title: value.entry.title })),
          activeIndex: Math.max(0, allowed.findIndex(value => value.index === saved.activeIndex)) };
      }).filter(tab => /^https?:/i.test(tab.url)),
    })) };
  }
  selectTab(tabId: string): void { this.tabs.select(this.windowForTab(tabId), tabId); }
  closeTab(tabId: string): void {
    const window = this.windowForTab(tabId);
    this.tabs.requestClose(window, tabId, () => {
      this.events.emit({ type: 'tabClosed', context: window.context, windowId: window.id, tabId });
      if (!window.tabIds.length && !window.native.isDestroyed()) this.closeWindow(window.id);
    });
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
  find(tabId: string, text: string, options: { forward: boolean; findNext: boolean; matchCase: boolean }) { return this.pageActions.find(tabId, text, options); }
  stopFind(tabId: string): void { this.pageActions.stopFind(tabId); }
  zoom(tabId: string, action: 'in' | 'out' | 'reset') { return this.pageActions.zoom(tabId, action); }
  getZoom(tabId: string) { return this.pageActions.getZoom(tabId); }
  print(tabId: string) { return this.pageActions.print(tabId); }
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
        this.options.onProfileReady?.(profile.id);
        const savedWindows = this.repository.read(profile.id);
        if (this.preferences.get(profile.id)?.startup === 'new-tab') {
          if (savedWindows.length) await this.openWindow({ profileId: profile.id });
          continue;
        }
        for (const saved of savedWindows) {
          const window = await this.createWindow(profile.id, false, saved);
          for (const tab of saved.tabs) await this.tabs.create(window, { active: false }, tab);
          if (saved.activeTabId && window.tabIds.includes(saved.activeTabId)) window.activeTabId = saved.activeTabId;
          window.layout.splitTabIds = saved.layout.splitTabIds.filter(tabId => window.tabIds.includes(tabId));
          window.layout.sidebarTabId = saved.layout.sidebarTabId && window.tabIds.includes(saved.layout.sidebarTabId) ? saved.layout.sidebarTabId : null;
          if (!window.tabIds.length) await this.openTab({ windowId: window.id });
          this.ready(window);
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
    this.auxiliaryViews.dispose();
    this.navigationPreparation.dispose();
    for (const window of [...this.windows.records.values()]) window.native.destroy();
    await this.sessions.dispose();
    this.events.dispose();
  }

  private async createWindow(profileId: string, isPrivate: boolean, saved?: SavedWindow) {
    this.options.onProfileReady?.(profileId);
    const context = this.sessions.acquire(profileId, isPrivate);
    try {
      const window = await this.windows.create(context, saved);
      window.layout.verticalTabs = this.preferences.get(profileId)?.verticalTabs ?? false;
      return window;
    }
    catch (error) { await this.sessions.release(context); throw error; }
  }
  private ready(window: WindowRecord): void {
    window.ready = true;
    this.events.emit({ type: 'windowReady', windowId: window.id, context: window.context });
    this.changed(window);
  }
  private windowForTab(tabId: string) { return this.windows.get(this.tabs.get(tabId).snapshot.windowId); }
  private changed(window: WindowRecord): void {
    if (window.native.isDestroyed() || this.quitting) return;
    this.layout?.apply(window);
    if (!this.restoring) this.recovery?.schedule();
    this.broadcast();
  }
  private broadcast(): void {
    this.revision += 1;
    for (const target of this.windows.records.values()) {
      if (target.native.isDestroyed()) continue;
      this.events.emit({ type: 'stateChanged', windowId: target.id, state: this.getState(target.id) });
    }
  }
  private windowClosed(window: WindowRecord): void {
    this.auxiliaryViews.closeWindow(window.id);
    for (const tabId of [...window.tabIds]) {
      if (this.tabs.records.has(tabId)) {
        this.tabs.close(window, tabId, false);
        this.events.emit({ type: 'tabClosed', context: window.context, windowId: window.id, tabId });
      }
    }
    this.tabs.forgetWindow(window.id);
    void this.sessions.release(window.context).catch(error => this.reportError(error));
    if (!this.quitting) this.broadcast();
    if (!this.quitting && !this.restoring) this.recovery.schedule();
  }
  private reportError(error: unknown): void {
    this.options.onError?.(error instanceof BrowserError ? error : new BrowserError('INTERNAL', '浏览器核心操作失败'));
  }
}
