import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';

export class ExtensionPopupController {
  private readonly openViews = new Map<string, { id: string; extensionId: string }>();
  constructor(private readonly runtime: FeatureRuntime) {}

  async open(windowId: string, extensionId: string, url: string): Promise<boolean> {
    const target = new URL(url);
    if (target.protocol !== 'chrome-extension:' || target.hostname !== extensionId) {
      throw new BrowserError('FORBIDDEN', '扩展弹出页面必须属于当前扩展');
    }
    const previous = this.openViews.get(windowId);
    this.close(windowId);
    if (previous?.extensionId === extensionId) return false;
    const window = this.runtime.core.getWindow(windowId);
    const viewport = window.layout.viewport;
    const width = Math.min(420, Math.max(280, viewport.width));
    const height = Math.min(560, Math.max(200, viewport.height));
    const id = await this.runtime.core.openAuxiliaryView(windowId, {
      kind: 'extension-popup', url: target.href,
      bounds: { x: Math.max(0, viewport.x + viewport.width - width - 12), y: Math.max(0, viewport.y), width, height },
    });
    this.openViews.set(windowId, { id, extensionId });
    return true;
  }

  close(windowId: string): void {
    const view = this.openViews.get(windowId);
    if (view) this.runtime.core.closeAuxiliaryView(view.id);
    this.openViews.delete(windowId);
  }

  closeExtension(extensionId: string): void {
    for (const [windowId, view] of this.openViews) if (view.extensionId === extensionId) this.close(windowId);
  }

  dispose(): void { for (const windowId of this.openViews.keys()) this.close(windowId); }
}
