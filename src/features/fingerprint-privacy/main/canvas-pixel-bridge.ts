import { ipcMain } from 'electron';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { PRIVACY_CANVAS_CHANNEL, type CanvasPixelResult } from '../runtime/canvas-protocol';
import { BravePixelAlgorithm, type PixelFarblingPort } from './brave-pixel-algorithm';
import { PrivacyService } from './privacy-service';

export function registerCanvasPixelBridge(runtime: FeatureRuntime, service: PrivacyService) {
  const algorithm: PixelFarblingPort = new BravePixelAlgorithm();
  const listener = (event: Electron.IpcMainEvent, payload: unknown) => {
    const result: CanvasPixelResult = { active: false, bytes: new Uint8Array() };
    event.returnValue = result;
    try {
      if (!payload || typeof payload !== 'object' || !('bytes' in payload) || !(payload.bytes instanceof Uint8Array)
        || !('url' in payload) || typeof payload.url !== 'string') {
        event.returnValue = { ...result, error: '像素过滤请求格式无效' }; return;
      }
      const frame = event.senderFrame;
      const tab = service.tabForContents(event.sender.id);
      if (!tab || !frame || frame.isDestroyed() || frame !== event.sender.mainFrame || frame.url !== payload.url
        || event.sender.session !== runtime.core.sessionForContext(tab)) {
        event.returnValue = { ...result, error: '像素过滤来源已变化或不是已接入的主页面' }; return;
      }
      if (payload.bytes.byteLength > 64 * 1024 * 1024) {
        event.returnValue = { ...result, error: '画布超过当前同步像素过滤上限，未返回未保护像素' }; return;
      }
      const policy = service.framePolicy(event.sender.id, frame.url);
      if (!policy.token || policy.mode === 'off') { event.returnValue = { active: false, bytes: payload.bytes }; return; }
      event.returnValue = { active: true, bytes: algorithm.perturb(payload.bytes, policy.token) } satisfies CanvasPixelResult;
    } catch { event.returnValue = { ...result, error: '画布指纹过滤失败，未返回未保护像素' }; }
  };
  ipcMain.on(PRIVACY_CANVAS_CHANNEL, listener);
  return () => ipcMain.removeListener(PRIVACY_CANVAS_CHANNEL, listener);
}
