import { BrowserWindow, Notification, net, powerMonitor } from 'electron';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { AdEventType, AdPlacement } from './delivery-types';

export interface AdsNotificationPort {
  available(windowId: string): boolean;
  show(placement: AdPlacement, event: (type: AdEventType) => void, failed: (message: string) => void): () => void;
}

export class ElectronAdsNotificationAdapter implements AdsNotificationPort {
  constructor(private readonly runtime: FeatureRuntime) {}
  findWindow(context: BrowserContext): string | undefined {
    for (const native of BrowserWindow.getAllWindows()) {
      if (native.isDestroyed()) continue;
      const window = this.runtime.core.getWindowForSender(native.webContents.id);
      if (window?.contextId === context.contextId && !window.isPrivate && native.isFocused()) return window.id;
    }
    return undefined;
  }
  available(windowId: string): boolean {
    const window = this.runtime.core.getNativeWindow(windowId);
    const state = this.runtime.core.getWindow(windowId);
    return Notification.isSupported() && net.isOnline() && !window.isDestroyed() && window.isFocused()
      && !window.isFullScreen() && powerMonitor.getSystemIdleTime() < 300 && !state.tabs.some(tab => tab.audible);
  }
  show(placement: AdPlacement, event: (type: AdEventType) => void, failed: (message: string) => void): () => void {
    const notification = new Notification({ title: placement.creative.title, body: placement.creative.body, silent: true, timeoutType: 'default' });
    let active = true; let shown = false; let clicked = false;
    notification.on('show', () => { if (active && !shown) { shown = true; event('view'); } });
    notification.on('click', () => { if (active && shown && !clicked) { clicked = true; event('click'); } });
    notification.on('close', () => { if (active && shown && !clicked) event('dismiss'); active = false; });
    notification.on('failed', (_event, error) => { if (active) failed(error || '系统无法展示通知广告'); active = false; });
    notification.show();
    return () => { active = false; notification.close(); notification.removeAllListeners(); };
  }
}
