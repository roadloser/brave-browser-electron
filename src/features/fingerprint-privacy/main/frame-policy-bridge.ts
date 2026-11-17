import { ipcMain } from 'electron';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { PRIVACY_RUNTIME_CHANNEL, type FramePrivacyPolicy } from '../runtime/protocol';
import { PrivacyService } from './privacy-service';

export function registerFramePolicyBridge(runtime: FeatureRuntime, service: PrivacyService) {
  const listener = (event: Electron.IpcMainEvent, payload: unknown) => {
    const unavailable: FramePrivacyPolicy = { mode: 'off', token: null, scope: null };
    event.returnValue = unavailable;
    try {
      if (!payload || typeof payload !== 'object' || !('url' in payload) || typeof payload.url !== 'string' || payload.url.length > 32768) return;
      const frame = event.senderFrame;
      const tab = service.tabForContents(event.sender.id);
      if (!tab || !frame || frame.isDestroyed() || frame !== event.sender.mainFrame || frame.url !== payload.url) return;
      if (event.sender.session !== runtime.core.sessionForContext(tab)) return;
      event.returnValue = service.framePolicy(event.sender.id, frame.url);
    } catch { event.returnValue = unavailable; }
  };
  ipcMain.on(PRIVACY_RUNTIME_CHANNEL, listener);
  return () => ipcMain.removeListener(PRIVACY_RUNTIME_CHANNEL, listener);
}
