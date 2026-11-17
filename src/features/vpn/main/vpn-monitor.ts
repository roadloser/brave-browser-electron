export class VpnMonitor {
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private failures = 0;
  constructor(private readonly refresh: (profileId: string) => Promise<boolean>, private readonly failed: (profileId: string) => void) {}
  watch(profileId: string): void {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.failures = 0;
    this.schedule(profileId);
  }
  dispose(): void { this.disposed = true; if (this.timer) clearTimeout(this.timer); }
  private schedule(profileId: string): void {
    this.timer = setTimeout(() => {
      void this.refresh(profileId).then(active => {
        this.failures = 0;
        if (active && !this.disposed) this.schedule(profileId);
      }).catch(() => {
        this.failures += 1;
        if (this.failures < 3 && !this.disposed) this.schedule(profileId);
        else if (!this.disposed) this.failed(profileId);
      });
    }, 5000);
  }
}
