import type { ElectronChromeExtensions } from 'electron-chrome-extensions';
import type { BrowserCorePort } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';
import type { ExtensionPopupController } from './popup-controller';

type ActionDetails = { extensionId: string; tabId: number };
type ActionInternals = {
  getPopupUrl: (extensionId: string, tabId: number) => string | undefined;
  activateClick: (details: ActionDetails) => void;
  onUpdate: () => void;
};
type LibraryInternals = {
  api: { browserAction: ActionInternals };
  ctx: {
    store: { tabDetailsCache: Map<number, unknown> };
    router: { sendEvent: (extensionId: string, name: string, data: unknown) => void };
  };
};

function internals(library: ElectronChromeExtensions): LibraryInternals {
  const candidate = library as unknown as LibraryInternals;
  if (typeof candidate.api?.browserAction?.getPopupUrl !== 'function'
    || typeof candidate.api.browserAction.activateClick !== 'function'
    || typeof candidate.api.browserAction.onUpdate !== 'function'
    || !(candidate.ctx?.store?.tabDetailsCache instanceof Map)
    || typeof candidate.ctx.router?.sendEvent !== 'function') {
    throw new BrowserError('UNAVAILABLE', '扩展依赖接口发生变化，需更新兼容适配后再启用扩展');
  }
  return candidate;
}

export function createActionAdapter(library: ElectronChromeExtensions, core: BrowserCorePort, popup: ExtensionPopupController,
  findTab: (webContentsId: number) => { id: string; windowId: string }, onError: (error: unknown) => void) {
  const state = internals(library);
  const originalActivate = state.api.browserAction.activateClick;
  const trigger = async (extensionId: string, webContentsId: number) => {
    const tab = findTab(webContentsId);
    const popupUrl = state.api.browserAction.getPopupUrl(extensionId, webContentsId);
    if (popupUrl) return popup.open(tab.windowId, extensionId, popupUrl);
    popup.close(tab.windowId);
    const details = state.ctx.store.tabDetailsCache.get(webContentsId);
    if (!details) throw new BrowserError('UNAVAILABLE', '扩展标签状态尚未就绪，请重试');
    core.selectTab(tab.id);
    state.ctx.router.sendEvent(extensionId, 'browserAction.onClicked', details);
    return false;
  };
  state.api.browserAction.activateClick = details => { void trigger(details.extensionId, details.tabId).catch(onError); };
  return {
    trigger,
    dispose() { state.api.browserAction.activateClick = originalActivate; },
  };
}
