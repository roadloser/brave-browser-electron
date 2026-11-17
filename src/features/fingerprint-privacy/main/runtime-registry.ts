import { BrowserError } from '../../../shared/errors';

export interface PrivacyRuntimeInstance {
  start(): Promise<void>;
  updateZoom(factor: number): Promise<void>;
  dispose(): void;
}

export class PrivacyRuntimeRegistry {
  private readonly active = new Map<string, PrivacyRuntimeInstance>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly generations = new Map<string, number>();
  private disposed = false;

  has(tabId: string): boolean { return this.active.has(tabId); }
  current(tabId: string): PrivacyRuntimeInstance | undefined { return this.active.get(tabId); }

  prepare(tabId: string, create: () => PrivacyRuntimeInstance): Promise<void> {
    if (this.disposed) return Promise.reject(new BrowserError('CANCELLED', '指纹运行时已释放'));
    if (this.active.has(tabId)) return Promise.resolve();
    const existing = this.pending.get(tabId);
    if (existing) return existing;
    const generation = this.generations.get(tabId) ?? 0;
    const instance = create();
    const operation = Promise.resolve().then(() => instance.start()).then(() => {
      if (this.disposed || (this.generations.get(tabId) ?? 0) !== generation) {
        instance.dispose();
        throw new BrowserError('CANCELLED', '标签已关闭或运行时已替换，迟到初始化结果已释放');
      }
      this.active.set(tabId, instance);
    }).catch(error => { instance.dispose(); throw error; }).finally(() => {
      if (this.pending.get(tabId) === operation) this.pending.delete(tabId);
    });
    this.pending.set(tabId, operation);
    return operation;
  }

  release(tabId: string): void {
    this.generations.set(tabId, (this.generations.get(tabId) ?? 0) + 1);
    this.active.get(tabId)?.dispose();
    this.active.delete(tabId);
    this.pending.delete(tabId);
  }

  dispose(): void {
    this.disposed = true;
    for (const instance of this.active.values()) instance.dispose();
    this.active.clear(); this.pending.clear();
  }
}
