import type { FeatureRuntime } from '../../shared/module-lifecycle';
import { BrowserError } from '../../shared/errors';
import { attachBrowserKeyboard } from './keyboard-controller';

export function registerBrowserIpc(runtime: FeatureRuntime): () => void {
  const { router, core } = runtime;
  const keyboard = new Map<number, () => void>();
  const assertTab = (tabId: string, windowId: string) => {
    if (core.getTab(tabId).windowId !== windowId) throw new BrowserError('FORBIDDEN', '不能操作其他窗口的标签');
  };
  const disposers = [
    router.handle('browser.getState', (_payload, context) => core.getState(context.windowId)),
    router.handle('browser.createProfile', payload => core.createProfile(payload.name)),
    router.handle('browser.renameProfile', payload => core.renameProfile(payload.profileId, payload.name)),
    router.handle('browser.deleteProfile', payload => core.deleteProfile(payload.profileId, payload.confirmName)),
    router.handle('browser.openWindow', (payload, context) => core.openWindow({ ...payload, profileId: payload.profileId ?? context.profileId })),
    router.handle('browser.closeWindow', (_payload, context) => core.closeWindow(context.windowId)),
    router.handle('browser.openTab', (payload, context) => core.openTab({ ...payload, windowId: context.windowId })),
    router.handle('browser.openFile', (_payload, context) => core.openFile(context.windowId)),
    router.handle('browser.selectTab', (payload, context) => { assertTab(payload.tabId, context.windowId); core.selectTab(payload.tabId); }),
    router.handle('browser.closeTab', (payload, context) => { assertTab(payload.tabId, context.windowId); core.closeTab(payload.tabId); }),
    router.handle('browser.navigate', (payload, context) => { assertTab(payload.tabId, context.windowId); return core.navigate(payload.tabId, payload.url); }),
    router.handle('browser.back', (payload, context) => { assertTab(payload.tabId, context.windowId); core.goBack(payload.tabId); }),
    router.handle('browser.forward', (payload, context) => { assertTab(payload.tabId, context.windowId); core.goForward(payload.tabId); }),
    router.handle('browser.reload', (payload, context) => { assertTab(payload.tabId, context.windowId); core.reload(payload.tabId, payload.bypassCache); }),
    router.handle('browser.stop', (payload, context) => { assertTab(payload.tabId, context.windowId); core.stop(payload.tabId); }),
    router.handle('browser.moveTab', (payload, context) => { assertTab(payload.tabId, context.windowId); core.moveTab(payload.tabId, payload.index); }),
    router.handle('browser.pinTab', (payload, context) => { assertTab(payload.tabId, context.windowId); core.pinTab(payload.tabId, payload.pinned); }),
    router.handle('browser.muteTab', (payload, context) => { assertTab(payload.tabId, context.windowId); core.muteTab(payload.tabId, payload.muted); }),
    router.handle('browser.duplicateTab', (payload, context) => { assertTab(payload.tabId, context.windowId); return core.duplicateTab(payload.tabId); }),
    router.handle('browser.reopenClosedTab', (_payload, context) => core.reopenClosedTab(context.windowId)),
    router.handle('browser.setLayout', (payload, context) => core.setLayout(context.windowId, payload)),
    router.handle('browser.windowAction', (payload, context) => core.windowAction(context.windowId, payload.action)),
    core.onEvent(event => {
      if (event.type === 'stateChanged') {
        runtime.publish('browser.state', event.state, { windowId: event.windowId });
        for (const window of event.state.windows) {
          const contents = window.tabs.map(tab => core.getTabWebContents(tab.id));
          for (const target of contents) {
            if (!keyboard.has(target.id)) {
              keyboard.set(target.id, attachBrowserKeyboard(runtime, window.id, target));
              target.once('destroyed', () => keyboard.delete(target.id));
            }
          }
        }
      }
    }),
  ];
  return () => { for (const dispose of keyboard.values()) dispose(); keyboard.clear(); for (const dispose of disposers.reverse()) dispose(); };
}
