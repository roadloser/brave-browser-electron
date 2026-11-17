import type { FeatureRuntime } from '../../shared/module-lifecycle';
import { BrowserError } from '../../shared/errors';

export function registerBrowserActions(runtime: FeatureRuntime): () => void {
  const { core, router } = runtime;
  const assertTab = (tabId: string, windowId: string) => {
    if (core.getTab(tabId).windowId !== windowId) throw new BrowserError('FORBIDDEN', '不能操作其他窗口的页面');
  };
  const disposers = [
    router.handle('browser.find', (payload, context) => { assertTab(payload.tabId, context.windowId); return { requestId: core.find(payload.tabId, payload.text, payload) }; }),
    router.handle('browser.stopFind', (payload, context) => { assertTab(payload.tabId, context.windowId); core.stopFind(payload.tabId); }),
    router.handle('browser.zoom', (payload, context) => { assertTab(payload.tabId, context.windowId); return { factor: core.zoom(payload.tabId, payload.action) }; }),
    router.handle('browser.getZoom', (payload, context) => { assertTab(payload.tabId, context.windowId); return { factor: core.getZoom(payload.tabId) }; }),
    router.handle('browser.print', (payload, context) => { assertTab(payload.tabId, context.windowId); return core.print(payload.tabId); }),
  ];
  return () => disposers.forEach(dispose => dispose());
}
