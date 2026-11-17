import { WebContentsView, type Session } from 'electron';
import { BrowserError } from '../../../shared/errors';

export type InspectedCookie = {
  name: string; domain: string; path: string; secure: boolean; httpOnly: boolean; session: boolean;
  expires?: number; sameSite?: string; sourceScheme?: string; sourcePort?: number;
  partitionKey?: { topLevelSite: string; hasCrossSiteAncestor: boolean };
  partitionKeyOpaque?: boolean;
};
export type OriginUsage = { usage: number; quota: number; usageBreakdown: { storageType: string; usage: number }[] };

export class SiteDataInspector {
  private view?: WebContentsView;
  private ready?: Promise<void>;
  private disposed = false;
  constructor(private readonly browserSession: Session) {}
  async cookies(): Promise<InspectedCookie[]> {
    const response = await this.send<{ cookies: Array<InspectedCookie & { value?: string }> }>('Network.getAllCookies');
    return response.cookies.map(({ value: _value, ...metadata }) => metadata);
  }
  usage(origin: string): Promise<OriginUsage> {
    return this.send('Storage.getUsageAndQuota', { origin });
  }
  async removeCookie(cookie: InspectedCookie): Promise<void> {
    if (cookie.partitionKeyOpaque) throw new BrowserError('UNAVAILABLE', '此 Cookie 使用不透明分区键，当前接口不能精确删除');
    await this.send('Network.deleteCookies', {
      name: cookie.name, domain: cookie.domain, path: cookie.path,
      ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
    });
  }
  dispose(): void {
    this.disposed = true;
    const contents = this.view?.webContents;
    if (contents && !contents.isDestroyed()) {
      if (contents.debugger.isAttached()) contents.debugger.detach();
      contents.close({ waitForBeforeUnload: false });
    }
    this.view = undefined;
  }
  private async initialize(): Promise<void> {
    if (this.disposed) throw new BrowserError('CANCELLED', '站点数据会话已关闭');
    if (!this.ready) {
      this.view = new WebContentsView({ webPreferences: {
        session: this.browserSession, sandbox: true, contextIsolation: true,
        nodeIntegration: false, javascript: false, webSecurity: true,
      } });
      this.view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.view.webContents.on('will-navigate', event => event.preventDefault());
      this.ready = this.view.webContents.loadURL('about:blank').then(() => {
        if (this.disposed || !this.view || this.view.webContents.isDestroyed()) throw new BrowserError('CANCELLED', '站点数据会话已关闭');
        this.view.webContents.debugger.attach('1.3');
      });
    }
    return this.ready;
  }
  private async send<Result>(method: string, parameters?: Record<string, unknown>): Promise<Result> {
    await this.initialize();
    if (!this.view || this.disposed || this.view.webContents.isDestroyed()) throw new BrowserError('CANCELLED', '站点数据会话已关闭');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.view.webContents.debugger.sendCommand(method, parameters) as Promise<Result>,
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new BrowserError('UNAVAILABLE', '读取或处理站点数据超时，请重试')), 10000); }),
      ]);
    } finally { clearTimeout(timeout); }
  }
}
