import { contextBridge, ipcRenderer } from 'electron';
import { installBraveAudioPolicy } from './brave-audio-adapter';
import { PRIVACY_RUNTIME_CHANNEL, type FramePrivacyPolicy, type PrivacyRuntimePort } from './protocol';
import { PRIVACY_CANVAS_BRIDGE, PRIVACY_CANVAS_CHANNEL, type CanvasPixelResult } from './canvas-protocol';
import { installBraveCanvasPolicy } from './brave-canvas-adapter';

class ElectronFramePrivacyAdapter implements PrivacyRuntimePort {
  install(policy: FramePrivacyPolicy) {
    return contextBridge.executeInMainWorld({ func: installBraveAudioPolicy, args: [policy] }) as { installed: boolean; coveredApis: string[] };
  }
}

if (window === window.top && (location.protocol === 'http:' || location.protocol === 'https:')) {
  const policy = ipcRenderer.sendSync(PRIVACY_RUNTIME_CHANNEL, { url: location.href }) as FramePrivacyPolicy;
  if (policy?.token && policy.mode !== 'off') {
    const adapter: PrivacyRuntimePort = new ElectronFramePrivacyAdapter();
    try { adapter.install(policy); } catch {}
    contextBridge.exposeInMainWorld(PRIVACY_CANVAS_BRIDGE, {
      pixels(bytes: Uint8Array): CanvasPixelResult {
        return ipcRenderer.sendSync(PRIVACY_CANVAS_CHANNEL, { bytes, url: location.href }) as CanvasPixelResult;
      },
    });
    try { contextBridge.executeInMainWorld({ func: installBraveCanvasPolicy, args: [PRIVACY_CANVAS_BRIDGE] }); } catch {}
  }
}
