import { BrowserWindow, session, type Session } from 'electron';
import { createHash } from 'node:crypto';
import { accountOrigin, accountUrl } from './types';
import { BrowserError } from '../../../../shared/errors';

export class VpnAccountWindow {
  readonly browserSession: Session;
  readonly window: BrowserWindow;
  private readonly timer: ReturnType<typeof setTimeout>;
  private done = false;
  constructor(profileId: string, preload: string, parent: BrowserWindow, expired: () => void, closed: () => void) {
    this.browserSession = session.fromPartition(`persist:vpn-account:${createHash('sha256').update(profileId).digest('hex')}`);
    this.browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.browserSession.setPermissionCheckHandler(() => false);
    this.window = new BrowserWindow({ width: 980, height: 780, parent, show: false, title: 'Brave 账户 · account.brave.com', autoHideMenuBar: true,
      webPreferences: { session: this.browserSession, preload, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false } });
    const contents = this.window.webContents;
    contents.setWindowOpenHandler(details => {
      try { if (new URL(details.url).origin === accountOrigin) void contents.loadURL(details.url); } catch {}
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) event.preventDefault(); }
      catch { event.preventDefault(); }
    });
    contents.on('page-title-updated', event => event.preventDefault());
    contents.on('did-navigate', (_event, url) => { try { this.window.setTitle(`Brave 账户 · ${new URL(url).hostname}`); } catch {} });
    contents.on('will-attach-webview', event => event.preventDefault());
    this.window.once('ready-to-show', () => this.window.show());
    this.window.once('closed', () => { clearTimeout(this.timer); if (!this.done) closed(); });
    this.timer = setTimeout(() => { if (!this.done) { expired(); this.close(); } }, 10 * 60 * 1000);
  }
  async open(): Promise<void> {
    try { await this.window.loadURL(accountUrl); }
    catch { throw new BrowserError('UNAVAILABLE', '无法打开官方账户页面，请重试'); }
  }
  close(): void {
    this.done = true;
    clearTimeout(this.timer);
    if (!this.window.isDestroyed()) this.window.destroy();
  }
  static async clear(profileId: string): Promise<void> {
    const browserSession = session.fromPartition(`persist:vpn-account:${createHash('sha256').update(profileId).digest('hex')}`);
    await browserSession.clearData();
    await browserSession.closeAllConnections();
  }
}
