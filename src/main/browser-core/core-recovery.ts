import type { ProfileManager } from './profile-manager';
import type { WindowManager } from './window-manager';
import type { TabManager } from './tab-manager';
import type { RecoveryRepository } from './recovery-repository';

export class CoreRecovery {
  private timer?: ReturnType<typeof setTimeout>;
  private suspended = false;

  constructor(
    private readonly profiles: ProfileManager,
    private readonly windows: WindowManager,
    private readonly tabs: TabManager,
    private readonly repository: RecoveryRepository,
    private readonly onError: (error: unknown) => void,
  ) {}

  schedule(): void {
    if (this.suspended) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try { this.flush(); } catch (error) { this.onError(error); }
    }, 200);
  }

  flush(): void {
    clearTimeout(this.timer);
    for (const profile of this.profiles.list()) {
      const windows = [...this.windows.records.values()]
        .filter(window => !window.context.isPrivate && window.context.profileId === profile.id && !window.native.isDestroyed())
        .map(window => ({
          id: window.id, profileId: profile.id, activeTabId: window.activeTabId,
          tabs: window.tabIds.map(tabId => this.tabs.save(tabId)),
          layout: { ...window.layout, viewport: { ...window.layout.viewport }, splitTabIds: [...window.layout.splitTabIds] },
          bounds: window.native.getNormalBounds(), maximized: window.native.isMaximized(),
        }));
      this.repository.write(profile.id, windows);
    }
  }

  suspend(): void { this.suspended = true; clearTimeout(this.timer); }
}
