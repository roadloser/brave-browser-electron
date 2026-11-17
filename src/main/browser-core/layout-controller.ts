import type { BrowserLayout, Rectangle } from '../../shared/contracts/browser-core';
import { BrowserError } from '../../shared/errors';
import type { TabRecord, WindowRecord } from './core-state';
import { isInternalPage } from './internal-pages';

export class LayoutController {
  constructor(private readonly getTab: (tabId: string) => TabRecord) {}

  update(window: WindowRecord, patch: Partial<BrowserLayout>): void {
    const next = { ...window.layout, ...patch };
    const targets = [...next.splitTabIds, ...(next.sidebarTabId ? [next.sidebarTabId] : [])];
    if (targets.some(tabId => !window.tabIds.includes(tabId))) throw new BrowserError('FORBIDDEN', '布局引用了其他窗口的标签');
    if (new Set(targets).size !== targets.length) throw new BrowserError('INVALID_ARGUMENT', '分屏与侧栏标签不能重复');
    window.layout = next;
    this.apply(window);
  }

  apply(window: WindowRecord): void {
    for (const tabId of window.tabIds) this.getTab(tabId).view.setVisible(false);
    if (!window.layout.contentVisible || !window.activeTabId) return;
    const active = this.getTab(window.activeTabId);
    if (isInternalPage(active.snapshot.url)) return;
    const size = window.native.getContentBounds();
    const viewport = window.layout.viewport;
    const area: Rectangle = {
      x: Math.max(0, Math.round(viewport.x)),
      y: Math.max(0, Math.round(viewport.y)),
      width: Math.max(0, Math.min(Math.round(viewport.width), size.width - viewport.x)),
      height: Math.max(0, Math.min(Math.round(viewport.height), size.height - viewport.y)),
    };
    let mainWidth = area.width;
    if (window.layout.sidebarTabId) {
      const sidebarWidth = Math.min(window.layout.sidebarWidth, Math.floor(area.width * 0.5));
      mainWidth = Math.max(0, area.width - sidebarWidth - 4);
      this.show(window.layout.sidebarTabId, { ...area, x: area.x + mainWidth + 4, width: sidebarWidth });
    }
    const split = window.layout.splitTabIds.filter(tabId => window.tabIds.includes(tabId));
    if (split.length === 2 && split.includes(window.activeTabId)) {
      const firstWidth = Math.round((mainWidth - 4) * window.layout.splitRatio);
      this.show(split[0], { ...area, width: firstWidth });
      this.show(split[1], { ...area, x: area.x + firstWidth + 4, width: Math.max(0, mainWidth - firstWidth - 4) });
    } else if (window.activeTabId !== window.layout.sidebarTabId) {
      this.show(window.activeTabId, { ...area, width: mainWidth });
    }
  }

  private show(tabId: string, bounds: Rectangle): void {
    const tab = this.getTab(tabId);
    if (isInternalPage(tab.snapshot.url)) return;
    tab.view.setBounds(bounds);
    tab.view.setVisible(true);
  }
}
