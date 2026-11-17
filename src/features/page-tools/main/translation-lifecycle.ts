import type { BrowserContext, NavigationCommitted, TabSnapshot } from '../../../shared/contracts/browser-core';
import type { PageTarget } from '../../../shared/runtime-ports';
import type { TranslationAdapterPort } from './providers/provider';

export type TranslationOperation = {
  target: PageTarget; context: BrowserContext; generation: number;
  controller: AbortController; timer?: ReturnType<typeof setTimeout>;
};
export class TranslationLifecycle {
  private readonly operations = new Map<string, TranslationOperation>();
  private sequence = Date.now() * 1000;
  constructor(private readonly adapter: TranslationAdapterPort) {}

  current(tabId: string) { return this.operations.get(tabId); }
  begin(tab: TabSnapshot) {
    const previous = this.operations.get(tab.id);
    if (previous) {
      this.release(previous);
      void this.adapter.restore(previous.target, true, previous.generation).catch(() => undefined);
    }
    const operation: TranslationOperation = {
      target: { tabId: tab.id, navigationId: tab.navigationId, origin: new URL(tab.url).origin },
      context: tab, generation: ++this.sequence, controller: new AbortController(),
    };
    this.operations.set(tab.id, operation); return operation;
  }
  isCurrent(operation: TranslationOperation) {
    return this.operations.get(operation.target.tabId) === operation && !operation.controller.signal.aborted;
  }
  async cancel(tabId: string, undo: boolean) {
    const operation = this.operations.get(tabId);
    if (!operation) return;
    this.operations.delete(tabId);
    this.release(operation);
    await this.adapter.restore(operation.target, !undo, operation.generation);
    return operation;
  }
  async navigation(visit: NavigationCommitted) {
    const operation = this.operations.get(visit.tabId);
    if (!operation || operation.target.navigationId === visit.navigationId) return { changed: false };
    this.operations.delete(visit.tabId);
    this.release(operation);
    if (/^https?:/.test(visit.url)) {
      try {
        await this.adapter.restore({
          tabId: visit.tabId, navigationId: visit.navigationId, origin: new URL(visit.url).origin,
        }, true, operation.generation);
      } catch (error) {
        return { changed: true, error: error instanceof Error ? error.message : '恢复原文失败，请重新加载页面' };
      }
    }
    return { changed: true };
  }
  close(tabId: string) {
    const operation = this.operations.get(tabId);
    if (operation) this.release(operation);
    this.operations.delete(tabId);
  }
  closeContext(contextId: string) {
    const closed: string[] = [];
    for (const [tabId, operation] of this.operations) if (operation.context.contextId === contextId) {
      this.close(tabId); closed.push(tabId);
    }
    return closed;
  }
  async rollback(operation: TranslationOperation) {
    if (this.operations.get(operation.target.tabId) === operation) this.operations.delete(operation.target.tabId);
    this.release(operation);
    await this.adapter.restore(operation.target, true, operation.generation);
  }
  async dispose() {
    const operations = [...this.operations.values()];
    this.operations.clear();
    await Promise.allSettled(operations.map(async (operation) => {
      this.release(operation);
      await this.adapter.restore(operation.target, false, operation.generation);
    }));
  }
  private release(operation: TranslationOperation) {
    operation.controller.abort(); clearTimeout(operation.timer);
  }
}
