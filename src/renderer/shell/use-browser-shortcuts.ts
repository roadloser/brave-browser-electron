import { useEffect } from 'react';
import type { WindowSnapshot } from '../../shared/contracts/browser-core';
import { browserClient } from '../client/browser-client';
import { useBrowserStore } from './browser-store';

export function useBrowserShortcuts(currentWindow: WindowSnapshot | undefined) {
  useEffect(() => {
    if (!currentWindow) return;
    const keydown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const active = currentWindow.activeTabId;
      let action: Promise<unknown> | undefined;
      if (modifier && key === 'l') {
        event.preventDefault();
        window.dispatchEvent(new Event('brave:focus-address'));
      } else if (modifier && key === 't') {
        action = event.shiftKey ? browserClient.command('browser.reopenClosedTab', {}) : browserClient.command('browser.openTab', {});
      } else if (modifier && key === 'n') {
        action = browserClient.command('browser.openWindow', { isPrivate: event.shiftKey });
      } else if (modifier && key === 'w' && active) {
        action = browserClient.command('browser.closeTab', { tabId: active });
      } else if (modifier && key === 'r' && active) {
        action = browserClient.command('browser.reload', { tabId: active, bypassCache: event.shiftKey });
      } else if ((event.ctrlKey && key === 'tab') || (modifier && event.altKey && (key === 'arrowright' || key === 'arrowleft'))) {
        const index = currentWindow.tabs.findIndex((tab) => tab.id === active);
        const direction = event.shiftKey || key === 'arrowleft' ? -1 : 1;
        const next = currentWindow.tabs[(index + direction + currentWindow.tabs.length) % currentWindow.tabs.length];
        if (next) action = browserClient.command('browser.selectTab', { tabId: next.id });
      } else if (modifier && /^[1-9]$/.test(key)) {
        const next = currentWindow.tabs[key === '9' ? currentWindow.tabs.length - 1 : Number(key) - 1];
        if (next) action = browserClient.command('browser.selectTab', { tabId: next.id });
      } else if (event.altKey && active && (key === 'arrowleft' || key === 'arrowright')) {
        action = browserClient.command(key === 'arrowleft' ? 'browser.back' : 'browser.forward', { tabId: active });
      }
      if (action) {
        event.preventDefault();
        action.catch(useBrowserStore.getState().reportError);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [currentWindow]);
}
