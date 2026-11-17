import { session, WebContentsView } from 'electron';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BrowserError } from '../../../../shared/errors';

const brandVersionSchema = z.object({ brand: z.string().min(1), version: z.string().regex(/^\d+(?:\.\d+)*$/) });
const nativeSnapshotSchema = z.object({
  userAgent: z.string().min(1),
  brands: z.array(brandVersionSchema).min(2).max(4),
  fullVersionList: z.array(brandVersionSchema).min(2).max(4),
  uaFullVersion: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/),
  platform: z.string().min(1), platformVersion: z.string(),
  architecture: z.string(), bitness: z.string(), model: z.string(),
  mobile: z.boolean(), wow64: z.boolean(), formFactors: z.array(z.string()).min(1),
});
export type NativeUserAgentSnapshot = z.infer<typeof nativeSnapshotSchema>;

const nativeSnapshotSource = `(async () => {
  const data = navigator.userAgentData;
  if (!data || typeof data.getHighEntropyValues !== 'function') throw new Error('原生UA元数据不可用');
  const values = await data.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'uaFullVersion', 'fullVersionList', 'wow64', 'formFactors']);
  return { ...values, userAgent: navigator.userAgent, brands: data.brands, platform: data.platform, mobile: data.mobile };
})()`;

export class NativeUserAgentSource {
  private pending?: Promise<NativeUserAgentSnapshot>;
  private cancel?: () => void;
  private disposed = false;

  get(): Promise<NativeUserAgentSnapshot> {
    if (this.disposed) return Promise.reject(new BrowserError('UNAVAILABLE', '原生UA能力已释放'));
    if (!this.pending) {
      const pending = this.sample();
      this.pending = pending;
      void pending.catch(() => { if (this.pending === pending) this.pending = undefined; });
    }
    return this.pending;
  }

  dispose(): void {
    this.disposed = true;
    this.cancel?.();
    this.pending = undefined;
  }

  private async sample(): Promise<NativeUserAgentSnapshot> {
    const identity = randomUUID();
    const probeUrl = `https://native-ua-${identity}.invalid/`;
    const browserSession = session.fromPartition(`native-user-agent:${identity}`, { cache: false });
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== probeUrl }));
    browserSession.protocol.handle('https', request => {
      if (request.url !== probeUrl) return new Response(null, { status: 403 });
      return new Response('<!doctype html><meta charset="utf-8"><title></title>', {
        headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'" },
      });
    });
    let view: WebContentsView | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      this.cancel = () => reject(new BrowserError('CANCELLED', '原生UA采样已取消'));
      timer = setTimeout(() => reject(new BrowserError('UNAVAILABLE', '原生UA采样超时')), 8000);
    });
    try {
      view = new WebContentsView({ webPreferences: {
        session: browserSession, contextIsolation: true, nodeIntegration: false,
        sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
        spellcheck: false, webgl: false, devTools: false,
      } });
      const contents = view.webContents;
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      contents.on('will-navigate', event => event.preventDefault());
      const read = async () => {
        await contents.loadURL(probeUrl);
        return nativeSnapshotSchema.parse(await contents.executeJavaScript(nativeSnapshotSource));
      };
      return await Promise.race([read(), cancelled]);
    } catch (error) {
      if (error instanceof BrowserError) throw error;
      throw new BrowserError('UNAVAILABLE', `无法取得完整原生UA元数据：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (timer) clearTimeout(timer);
      this.cancel = undefined;
      if (view && !view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
      browserSession.protocol.unhandle('https');
      browserSession.webRequest.onBeforeRequest(null);
      await browserSession.closeAllConnections();
    }
  }
}
