import type { BrowserCorePort } from '../../shared/runtime-ports';
import { BrowserError } from '../../shared/errors';

export class PageActions {
  private readonly zoomFactors = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  constructor(private readonly core: Pick<BrowserCorePort, 'getTabWebContents'>) {}
  find(tabId: string, text: string, options: { forward: boolean; findNext: boolean; matchCase: boolean }): number {
    return this.core.getTabWebContents(tabId).findInPage(text, options);
  }
  stopFind(tabId: string): void { this.core.getTabWebContents(tabId).stopFindInPage('clearSelection'); }
  zoom(tabId: string, action: 'in' | 'out' | 'reset'): number {
    const contents = this.core.getTabWebContents(tabId);
    const current = contents.getZoomFactor();
    const next = action === 'reset' ? 1 : action === 'in'
      ? this.zoomFactors.find(factor => factor > current + 0.01) ?? 5
      : [...this.zoomFactors].reverse().find(factor => factor < current - 0.01) ?? 0.25;
    contents.setZoomFactor(next);
    return next;
  }
  getZoom(tabId: string): number { return this.core.getTabWebContents(tabId).getZoomFactor(); }
  print(tabId: string): Promise<{ success: boolean; failureReason?: string }> {
    const contents = this.core.getTabWebContents(tabId);
    if (contents.isDestroyed()) throw new BrowserError('NOT_FOUND', '页面已关闭');
    return new Promise(resolve => contents.print({ silent: false, printBackground: true }, (success, failureReason) => resolve({ success, failureReason: failureReason || undefined })));
  }
}
