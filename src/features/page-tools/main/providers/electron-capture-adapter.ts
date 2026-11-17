import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import { BrowserError } from '../../../../shared/errors';
import type { CaptureAdapterPort } from './provider';

export class ElectronCaptureAdapter implements CaptureAdapterPort {
  constructor(private readonly runtime: FeatureRuntime) {}
  async capture(tabId: string, fullPage: boolean): Promise<Uint8Array> {
    const contents = this.runtime.core.getTabWebContents(tabId);
    if (!fullPage) return (await contents.capturePage()).toPNG();
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
        format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 },
      }) as { data: string };
      return Buffer.from(image.data, 'base64');
    } finally {
      if (!contents.isDestroyed() && contents.debugger.isAttached()) contents.debugger.detach();
    }
  }
}
