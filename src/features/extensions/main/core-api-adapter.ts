import type { ChromeExtensionOptions } from 'electron-chrome-extensions';
import type { BrowserContext, TabSnapshot } from '../../../shared/contracts/browser-core';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { ExtensionPermissionController } from './permission-controller';

export function createCoreApiAdapter(runtime: FeatureRuntime, context: BrowserContext) {
  function findWindow(nativeId?: number) {
    const candidates = runtime.core.getContexts().filter(candidate => candidate.profileId === context.profileId && !candidate.isPrivate);
    for (const candidate of candidates) {
      const windowIds = contextWindows.get(candidate.contextId) ?? [];
      for (const windowId of windowIds) {
        const window = runtime.core.getWindow(windowId);
        if (nativeId === undefined || runtime.core.getNativeWindow(window.id).id === nativeId) return window;
      }
    }
    throw new BrowserError('NOT_FOUND', '扩展请求的浏览器窗口不存在');
  }
  const contextWindows = new Map<string, string[]>();
  const synchronize = (snapshot: { windows: ReturnType<typeof runtime.core.getWindow>[] }) => {
    contextWindows.clear();
    for (const window of snapshot.windows) {
      if (window.profileId !== context.profileId || window.isPrivate) continue;
      contextWindows.set(window.contextId, [...(contextWindows.get(window.contextId) ?? []), window.id]);
    }
  };
  const findTab = (webContentsId: number): TabSnapshot => {
    for (const ids of contextWindows.values()) {
      for (const windowId of ids) {
        const window = runtime.core.getWindow(windowId);
        const tab = window.tabs.find(candidate => runtime.core.getTabWebContents(candidate.id).id === webContentsId);
        if (tab) return tab;
      }
    }
    throw new BrowserError('NOT_FOUND', '扩展请求的标签不存在');
  };
  const permissions = new ExtensionPermissionController(runtime);
  const options: ChromeExtensionOptions = {
    session: runtime.core.sessionForContext(context),
    async createTab(details) {
      const window = findWindow(details.windowId);
      const tab = await runtime.core.openTab({ windowId: window.id, url: details.url, active: details.active, pinned: details.pinned });
      if (details.index !== undefined) runtime.core.moveTab(tab.id, details.index);
      return [runtime.core.getTabWebContents(tab.id), runtime.core.getNativeWindow(window.id)];
    },
    selectTab(contents) { runtime.core.selectTab(findTab(contents.id).id); },
    removeTab(contents) { runtime.core.closeTab(findTab(contents.id).id); },
    assignTabDetails(details, contents) {
      const tab = findTab(contents.id);
      details.pinned = tab.pinned;
      details.audible = tab.audible;
      details.mutedInfo = { muted: tab.muted };
      details.status = tab.loading ? 'loading' : 'complete';
      details.incognito = tab.isPrivate;
    },
    async createWindow(details) {
      if (details.incognito) throw new BrowserError('UNAVAILABLE', '扩展无法在临时 Session 中运行');
      const window = await runtime.core.openWindow({ profileId: context.profileId });
      const urls = typeof details.url === 'string' ? [details.url] : details.url ?? [];
      for (const url of urls) await runtime.core.openTab({ windowId: window.id, url });
      return runtime.core.getNativeWindow(window.id);
    },
    removeWindow(window) { runtime.core.closeWindow(findWindow(window.id).id); },
    requestPermissions(extension, requested) { return permissions.request(context.profileId, extension, requested); },
  };
  return { options, synchronize };
}
