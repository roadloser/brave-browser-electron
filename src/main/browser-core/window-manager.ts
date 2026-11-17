import { BrowserWindow, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '../../shared/contracts/browser-core';
import { BrowserError } from '../../shared/errors';
import { defaultLayout, type SavedWindow, type WindowRecord } from './core-state';

export type WindowManagerOptions = {
  uiUrl: string;
  preloadPath: string;
  onClosed: (window: WindowRecord) => void;
  onChanged: (window: WindowRecord) => void;
  onBeforeClose: (window: WindowRecord) => boolean;
};

export class WindowManager {
  readonly records = new Map<string, WindowRecord>();

  constructor(private readonly options: WindowManagerOptions) {}

  async create(context: BrowserContext, saved?: SavedWindow): Promise<WindowRecord> {
    const bounds = saved?.bounds;
    const display = bounds ? screen.getDisplayMatching(bounds).workArea : undefined;
    const safeBounds = bounds && display ? {
      x: Math.max(display.x, Math.min(bounds.x, display.x + display.width - 480)),
      y: Math.max(display.y, Math.min(bounds.y, display.y + display.height - 240)),
      width: Math.max(640, Math.min(bounds.width, display.width)),
      height: Math.max(480, Math.min(bounds.height, display.height)),
    } : { width: 1280, height: 850 };
    const native = new BrowserWindow({
      ...safeBounds, minWidth: 640, minHeight: 480, show: false,
      title: context.isPrivate ? '私密窗口 · Brave Electron' : 'Brave Electron',
      backgroundColor: '#f4f4f7', titleBarStyle: 'hiddenInset',
      webPreferences: {
        preload: this.options.preloadPath, contextIsolation: true,
        nodeIntegration: false, sandbox: true, webSecurity: true,
        partition: 'trusted-ui:' + randomUUID(),
      },
    });
    const record: WindowRecord = {
      id: saved?.id ?? randomUUID(), context, native,
      tabIds: [], activeTabId: null,
      layout: saved ? { ...saved.layout, contentVisible: true, splitTabIds: [], sidebarTabId: null } : defaultLayout(),
    };
    this.records.set(record.id, record);
    native.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    native.webContents.on('will-navigate', event => event.preventDefault());
    for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'resize', 'move'] as const) {
      native.on(event, () => this.options.onChanged(record));
    }
    native.on('closed', () => {
      this.records.delete(record.id);
      this.options.onClosed(record);
    });
    native.on('close', event => { if (!this.options.onBeforeClose(record)) event.preventDefault(); });
    try {
      await native.loadURL(this.options.uiUrl);
      if (saved?.maximized) native.maximize();
      native.show();
      return record;
    } catch (error) {
      native.destroy();
      throw error;
    }
  }

  get(windowId: string): WindowRecord {
    const record = this.records.get(windowId);
    if (!record || record.native.isDestroyed()) throw new BrowserError('NOT_FOUND', '浏览器窗口已关闭');
    return record;
  }

  sender(webContentsId: number): WindowRecord | undefined {
    return [...this.records.values()].find(record => record.native.webContents.id === webContentsId);
  }
}
