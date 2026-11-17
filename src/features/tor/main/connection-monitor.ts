import type { TorBootstrap, TorRuntimePort } from './runtime-port';

export class TorConnectionMonitor {
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(private readonly runtime: TorRuntimePort, private readonly update: (state: TorBootstrap) => Promise<void>, private readonly fail: (reason: string) => Promise<void>) {}
  start(): void { this.timer = setTimeout(() => { void this.poll(); }, 3000); }
  dispose(): void { this.disposed = true; clearTimeout(this.timer); }
  private async poll(): Promise<void> {
    if (this.disposed) return;
    try {
      const status = await this.runtime.bootstrap();
      if (!this.disposed) await this.update(status);
    } catch (error) {
      if (!this.disposed) await this.fail(error instanceof Error ? error.message : 'Tor 线路状态不可用');
      return;
    }
    if (!this.disposed) this.timer = setTimeout(() => { void this.poll(); }, 3000);
  }
}
