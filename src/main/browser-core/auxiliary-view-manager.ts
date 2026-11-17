import { WebContentsView } from 'electron';
import { randomUUID } from 'node:crypto';
import type { Rectangle } from '../../shared/contracts/browser-core';
import { BrowserError } from '../../shared/errors';
import type { WindowRecord } from './core-state';
import type { SessionRegistry } from './session-registry';

export class AuxiliaryViewManager {
  private readonly views = new Map<string, { window: WindowRecord; view: WebContentsView }>();
  constructor(private readonly sessions: SessionRegistry) {}
  async open(window: WindowRecord, options: { kind: 'extension-popup'; url: string; bounds: Rectangle }): Promise<string> {
    const url = new URL(options.url);
    const browserSession = this.sessions.get(window.context);
    if (url.protocol !== 'chrome-extension:' || !browserSession.extensions.getExtension(url.hostname)) {
      throw new BrowserError('FORBIDDEN', '只能打开当前资料已安装扩展的弹出页');
    }
    const view = new WebContentsView({ webPreferences: {
      session: browserSession, sandbox: true, nodeIntegration: false, contextIsolation: true,
    } });
    const viewId = randomUUID();
    this.views.set(viewId, { window, view });
    window.native.contentView.addChildView(view);
    const size = window.native.getContentBounds();
    view.setBounds({
      x: Math.max(0, Math.min(Math.round(options.bounds.x), size.width - 50)),
      y: Math.max(0, Math.min(Math.round(options.bounds.y), size.height - 50)),
      width: Math.min(size.width, Math.max(50, Math.round(options.bounds.width))),
      height: Math.min(size.height, Math.max(50, Math.round(options.bounds.height))),
    });
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.on('will-navigate', (event, nextUrl) => {
      try {
        const next = new URL(nextUrl);
        if (next.protocol !== 'chrome-extension:' || next.hostname !== url.hostname) event.preventDefault();
      } catch { event.preventDefault(); }
    });
    try {
      await view.webContents.loadURL(url.href);
      view.webContents.focus();
      return viewId;
    } catch (error) { this.close(viewId); throw error; }
  }
  close(viewId: string): void {
    const entry = this.views.get(viewId);
    if (!entry) return;
    this.views.delete(viewId);
    if (!entry.window.native.isDestroyed()) entry.window.native.contentView.removeChildView(entry.view);
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close({ waitForBeforeUnload: false });
  }
  closeWindow(windowId: string): void {
    for (const [id, entry] of this.views) if (entry.window.id === windowId) this.close(id);
  }
  dispose(): void { for (const id of [...this.views.keys()]) this.close(id); }
}
