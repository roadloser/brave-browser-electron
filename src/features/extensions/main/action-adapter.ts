import type { ElectronChromeExtensions } from 'electron-chrome-extensions';
import type { BrowserCorePort } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';
import type { ExtensionPopupController } from './popup-controller';
import { z } from 'zod';
import type { ExtensionActionSnapshot } from '../../../shared/contracts/extensions';

type ActionDetails = { extensionId: string; tabId: number };
type ActionInternals = {
  getPopupUrl: (extensionId: string, tabId: number) => string | undefined;
  activateClick: (details: ActionDetails) => void;
  onUpdate: () => void;
  getState: () => unknown;
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
    || typeof candidate.api.browserAction.getState !== 'function'
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
  const originalUpdate = state.api.browserAction.onUpdate;
  let revision = 0;
  let disposed = false;
  const listeners = new Set<(revision: number) => void>();
  state.api.browserAction.onUpdate = function() {
    originalUpdate.call(state.api.browserAction);
    revision++;
    queueMicrotask(() => { if (!disposed) for (const listener of listeners) listener(revision); });
  };
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
    snapshot(webContentsId: number) {
      const actionDetails = z.object({
        title: z.string().optional(), text: z.string().optional(),
        color: z.union([z.string(), z.array(z.number().int().min(0).max(255)).length(4)]).optional(),
        popup: z.string().optional(),
      });
      const parsed = z.object({ actions: z.array(actionDetails.extend({
        id: z.string(), tabs: z.record(z.string(), actionDetails).optional(),
      })) }).parse(state.api.browserAction.getState());
      const actions: ExtensionActionSnapshot[] = parsed.actions.map(action => {
        const merged = { ...action, ...(action.tabs?.[String(webContentsId)] ?? {}) };
        const color = Array.isArray(merged.color)
          ? `rgba(${merged.color[0]},${merged.color[1]},${merged.color[2]},${merged.color[3] / 255})`
          : merged.color ?? '#666666';
        return { id: action.id, title: merged.title ?? '', badgeText: merged.text ?? '', badgeColor: color, hasPopup: Boolean(merged.popup) };
      });
      return { actions, revision };
    },
    subscribe(listener: (revision: number) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      disposed = true; listeners.clear();
      state.api.browserAction.activateClick = originalActivate;
      state.api.browserAction.onUpdate = originalUpdate;
    },
  };
}
