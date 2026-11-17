import type { CoreEvent } from '../../shared/contracts/browser-core';
import type { Dispose } from '../../shared/contracts/envelope';

export class PageEventSource {
  private readonly listeners = new Set<(event: CoreEvent) => void>();

  subscribe(listener: (event: CoreEvent) => void): Dispose {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: CoreEvent): void {
    for (const listener of [...this.listeners]) {
      try { listener(event); } catch (error) { console.error('浏览器事件订阅处理失败', error instanceof Error ? error.name : 'Error'); }
    }
  }

  dispose(): void { this.listeners.clear(); }
}
