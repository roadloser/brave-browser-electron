import { dialog } from 'electron';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';

export class CaptureService {
  private readonly capturing = new Set<string>();
  constructor(private readonly runtime: FeatureRuntime) {}

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
      const contents = this.runtime.core.getTabWebContents(tabId);
      let bytes: Buffer;
      if (fullPage) {
        if (contents.debugger.isAttached()) throw new BrowserError('CONFLICT', '调试器正在使用页面，请关闭开发者工具后重试完整截图');
        contents.debugger.attach('1.3');
        try {
          const metrics = await contents.debugger.sendCommand('Page.getLayoutMetrics') as {
            cssContentSize: { width: number; height: number };
          };
          const { width, height } = metrics.cssContentSize;
          if (width * height > 80_000_000 || height > 32760 || width > 16384) {
            throw new BrowserError('UNAVAILABLE', '页面过长，无法安全生成完整截图，请使用当前视口截图');
          }
          const image = await contents.debugger.sendCommand('Page.captureScreenshot', {
            format: 'png', captureBeyondViewport: true,
            clip: { x: 0, y: 0, width, height, scale: 1 },
          }) as { data: string };
          bytes = Buffer.from(image.data, 'base64');
        } finally {
          if (!contents.isDestroyed() && contents.debugger.isAttached()) contents.debugger.detach();
        }
      } else bytes = (await contents.capturePage()).toPNG();
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
