import { dialog } from 'electron';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import type { CaptureAdapterPort } from './providers/provider';
import { ElectronCaptureAdapter } from './providers/electron-capture-adapter';

export class CaptureService {
  private readonly capturing = new Set<string>();
  private readonly adapter: CaptureAdapterPort;
  constructor(private readonly runtime: FeatureRuntime) { this.adapter = new ElectronCaptureAdapter(runtime); }

  async capture(tabId: string, fullPage: boolean): Promise<{ saved: boolean; path?: string }> {
    if (this.capturing.has(tabId)) throw new BrowserError('CONFLICT', '此页面正在截图');
    const tab = this.runtime.core.getTab(tabId);
    if (!/^https?:/.test(tab.url)) throw new BrowserError('UNAVAILABLE', '请在网页中使用截图');
    this.capturing.add(tabId);
    let temporary: string | undefined;
    try {
      const target = await dialog.showSaveDialog(this.runtime.core.getNativeWindow(tab.windowId), {
        title: fullPage ? '保存完整网页截图' : '保存当前页面截图',
        defaultPath: `${(tab.title || '网页').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100)}.png`,
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      });
      if (target.canceled || !target.filePath) return { saved: false };
      this.assertNavigation(tabId, tab.navigationId);
      const bytes = await this.adapter.capture(tabId, fullPage);
      this.assertNavigation(tabId, tab.navigationId);
      temporary = `${target.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, bytes, { flag: 'wx' });
      this.assertNavigation(tabId, tab.navigationId);
      await rename(temporary, target.filePath);
      temporary = undefined;
      return { saved: true, path: target.filePath };
    } finally {
      this.capturing.delete(tabId);
      if (temporary) await unlink(temporary).catch(() => undefined);
    }
  }

  private assertNavigation(tabId: string, navigationId: string) {
    if (this.runtime.core.getTab(tabId).navigationId !== navigationId) throw new BrowserError('CANCELLED', '页面已改变，截图已取消');
  }
}
