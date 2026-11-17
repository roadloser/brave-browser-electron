import type { TabSnapshot } from '../../shared/contracts/browser-core';
import { BrowserError } from '../../shared/errors';

export class NavigationPreparation {
  private readonly handlers = new Map<string, (tab: TabSnapshot) => Promise<void>>();
  register(id: string, prepare: (tab: TabSnapshot) => Promise<void>): () => void {
    if (this.handlers.has(id)) throw new BrowserError('CONFLICT', '页面导航准备能力重复注册');
    this.handlers.set(id, prepare);
    return () => this.handlers.delete(id);
  }
  async prepare(tab: TabSnapshot): Promise<void> {
    for (const handler of this.handlers.values()) await handler({ ...tab });
  }
  dispose(): void { this.handlers.clear(); }
}
