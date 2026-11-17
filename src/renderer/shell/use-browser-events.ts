import { useEffect } from 'react';
import { browserClient } from '../client/browser-client';
import { useBrowserStore } from './browser-store';

export function useBrowserEvents() {
  useEffect(() => {
    let alive = true;
    const store = useBrowserStore.getState();
    const disposers: Array<() => void> = [];
    try {
      disposers.push(browserClient.on('browser.state', store.acceptSnapshot));
      disposers.push(browserClient.on('browser.shortcut', (shortcut) => {
        if (shortcut.action === 'focusAddress') window.dispatchEvent(new Event('brave:focus-address'));
      }));
      disposers.push(browserClient.on('app.error', (error) => store.reportError(error.message)));
      browserClient.command('browser.getState', {})
        .then((snapshot) => { if (alive) store.acceptSnapshot(snapshot); })
        .catch((error) => { if (alive) store.reportError(error); });
    } catch (error) {
      store.reportError(error);
    }
    return () => {
      alive = false;
      disposers.forEach((dispose) => dispose());
    };
  }, []);
}
