import type { Input, WebContents } from 'electron';
import type { FeatureRuntime } from '../../shared/module-lifecycle';

export function attachBrowserKeyboard(runtime: FeatureRuntime, windowId: string, contents: WebContents): () => void {
  const handler = (event: Electron.Event, input: Input) => {
    if (input.type !== 'keyDown') return;
    const modifier = process.platform === 'darwin' ? input.meta : input.control;
    const key = input.key.toLowerCase();
    if (!modifier && !(input.control && key === 'tab') && !(input.alt && ['arrowleft', 'arrowright'].includes(key))) return;
    const window = runtime.core.getWindow(windowId);
    const tabId = window.activeTabId;
    let action: (() => unknown) | undefined;
    if (modifier && key === 'l') action = () => runtime.publish('browser.shortcut', { action: 'focusAddress' }, { windowId });
    if (modifier && key === 't') action = input.shift ? () => runtime.core.reopenClosedTab(windowId) : () => runtime.core.openTab({ windowId });
    if (modifier && key === 'n') action = () => runtime.core.openWindow({ profileId: window.profileId, isPrivate: input.shift });
    if (modifier && key === 'o') action = () => runtime.core.openFile(windowId);
    if (modifier && key === 'f') action = () => runtime.publish('browser.shortcut', { action: 'findInPage' }, { windowId });
    if (modifier && key === 'p' && tabId) action = () => runtime.core.print(tabId);
    if (modifier && ['+', '='].includes(key) && tabId) action = () => runtime.core.zoom(tabId, 'in');
    if (modifier && key === '-' && tabId) action = () => runtime.core.zoom(tabId, 'out');
    if (modifier && key === '0' && tabId) action = () => runtime.core.zoom(tabId, 'reset');
    if (modifier && key === 'w' && tabId) action = () => runtime.core.closeTab(tabId);
    if (modifier && key === 'r' && tabId) action = () => runtime.core.reload(tabId, input.shift);
    if (input.alt && key === 'arrowleft' && tabId) action = () => runtime.core.goBack(tabId);
    if (input.alt && key === 'arrowright' && tabId) action = () => runtime.core.goForward(tabId);
    if (modifier && /^[1-9]$/.test(key)) {
      const index = key === '9' ? window.tabs.length - 1 : Number(key) - 1;
      if (window.tabs[index]) action = () => runtime.core.selectTab(window.tabs[index].id);
    }
    if (input.control && key === 'tab' && window.tabs.length) {
      const current = window.tabs.findIndex(tab => tab.id === tabId);
      const next = (current + (input.shift ? -1 : 1) + window.tabs.length) % window.tabs.length;
      action = () => runtime.core.selectTab(window.tabs[next].id);
    }
    if (!action) return;
    event.preventDefault();
    Promise.resolve().then(action).catch(error => runtime.publish('app.error', {
      code: 'INTERNAL', message: error instanceof Error ? error.message : '快捷键操作失败', recoverable: true,
    }, { windowId }));
  };
  contents.on('before-input-event', handler);
  return () => { if (!contents.isDestroyed()) contents.removeListener('before-input-event', handler); };
}
