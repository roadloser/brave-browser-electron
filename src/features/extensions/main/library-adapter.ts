import { Menu } from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import type { BrowserContext, BrowserSnapshot, TabSnapshot } from '../../../shared/contracts/browser-core';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { createCoreApiAdapter } from './core-api-adapter';
import { createActionAdapter } from './action-adapter';
import type { ExtensionPopupController } from './popup-controller';
import type { ExtensionLibraryPort } from './library-port';

export class ExtensionLibraryAdapter implements ExtensionLibraryPort {
  readonly library: ElectronChromeExtensions;
  private readonly coreAdapter;
  private readonly actions;
  private readonly tabs = new Map<string, { snapshot: TabSnapshot; contents: Electron.WebContents; release: () => void }>();
  private disposed = false;
  get profileId(): string { return this.context.profileId; }

  constructor(private readonly runtime: FeatureRuntime, readonly context: BrowserContext, popup: ExtensionPopupController) {
    this.coreAdapter = createCoreApiAdapter(runtime, context);
    const browserSession = runtime.core.sessionForContext(context);
    this.library = ElectronChromeExtensions.fromSession(browserSession) ?? new ElectronChromeExtensions(this.coreAdapter.options);
    this.actions = createActionAdapter(this.library, runtime.core, popup, contentsId => {
      const tab = [...this.tabs.values()].find(item => item.contents.id === contentsId);
      if (!tab) throw new BrowserError('NOT_FOUND', '扩展操作的标签不存在');
      return { id: tab.snapshot.id, windowId: tab.snapshot.windowId };
    }, error => this.report(error));
  }

  synchronize(state: BrowserSnapshot): void {
    if (this.disposed) return;
    this.coreAdapter.synchronize(state);
    const visible = new Set<string>();
    for (const window of state.windows) {
      if (window.profileId !== this.context.profileId || window.isPrivate) continue;
      for (const tab of window.tabs) {
        visible.add(tab.id);
        const tracked = this.tabs.get(tab.id);
        if (tracked) tracked.snapshot = tab;
        else {
          const contents = this.runtime.core.getTabWebContents(tab.id);
          const nativeWindow = this.runtime.core.getNativeWindow(window.id);
          this.library.addTab(contents, nativeWindow);
          const contextMenu = (_event: Electron.Event, parameters: Electron.ContextMenuParams) => {
            const items = this.library.getContextMenuItems(contents, parameters);
            if (items.length) {
              const menu = new Menu();
              items.forEach(item => menu.append(item));
              menu.popup({ window: nativeWindow });
            }
          };
          contents.on('context-menu', contextMenu);
          this.tabs.set(tab.id, { snapshot: tab, contents, release: () => contents.removeListener('context-menu', contextMenu) });
        }
        if (tab.id === window.activeTabId) this.library.selectTab(this.runtime.core.getTabWebContents(tab.id));
      }
    }
    for (const [id, tracked] of this.tabs) {
      if (visible.has(id)) continue;
      tracked.release();
      if (!tracked.contents.isDestroyed()) this.library.removeTab(tracked.contents);
      this.tabs.delete(id);
    }
  }

  activate(extensionId: string, tabId: string): Promise<boolean> {
    const tracked = this.tabs.get(tabId);
    if (!tracked) throw new BrowserError('UNAVAILABLE', '扩展标签连接尚未就绪，请重试');
    return this.actions.trigger(extensionId, tracked.contents.id);
  }

  actionState(tabId: string) {
    const tracked = this.tabs.get(tabId);
    if (!tracked) throw new BrowserError('UNAVAILABLE', '扩展标签状态尚未就绪');
    return this.actions.snapshot(tracked.contents.id);
  }
  onActionsChanged(listener: (revision: number) => void) { return this.actions.subscribe(listener); }

  dispose(): void {
    this.disposed = true;
    this.actions.dispose();
    for (const tracked of this.tabs.values()) {
      tracked.release();
      if (!tracked.contents.isDestroyed()) this.library.removeTab(tracked.contents);
    }
    this.tabs.clear();
  }

  private report(error: unknown): void {
    this.runtime.publish('app.error', {
      code: 'UNAVAILABLE', message: error instanceof Error ? error.message : '扩展操作失败', recoverable: true,
    }, { profileId: this.context.profileId });
  }
}
