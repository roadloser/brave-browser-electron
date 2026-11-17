import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';

export class TalkService {
  constructor(private readonly runtime: FeatureRuntime) {}
  async toggle(context: CommandContext) {
    const window = this.runtime.core.getWindow(context.windowId);
    const existing = window.tabs.find((tab) => {
      try { return new URL(tab.url).hostname === 'talk.brave.com'; } catch { return false; }
    });
    if (existing && window.layout.sidebarTabId === existing.id) {
      this.runtime.core.setLayout(window.id, { sidebarTabId: null });
      return null;
    }
    const tab = existing ?? await this.runtime.core.openTab({ windowId: window.id, url: 'https://talk.brave.com/', active: false, pinned: true });
    this.runtime.core.setLayout(window.id, { sidebarTabId: tab.id, sidebarWidth: 420 });
    return tab;
  }
  close(context: CommandContext) { this.runtime.core.setLayout(context.windowId, { sidebarTabId: null }); }
}
