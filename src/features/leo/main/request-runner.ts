import type { CommandContext } from '../../../shared/module-lifecycle';
import type { LeoMessage } from '../../../shared/contracts/leo';
import type { ProviderPort, ProviderRequest } from './providers/provider';
import { ProviderFailure } from './providers/provider';
import type { LeoStateStore } from './state-store';

export type ActiveRequest = {
  id: string; conversationId: string; modelId: string; assistantId: string;
  context: CommandContext; controller: AbortController; status: 'running' | 'cancelled' | 'failed'; error?: string;
  source?: { tabId: string; navigationId: string };
};

export class RequestRunner {
  readonly requests = new Map<string, ActiveRequest>();
  private readonly running = new Set<Promise<void>>();
  constructor(
    private readonly store: LeoStateStore,
    private readonly publish: (context: CommandContext) => void,
    private readonly invalidateKey: (context: CommandContext, modelId: string) => void,
  ) {}

  launch(active: ActiveRequest, provider: ProviderPort, request: Omit<ProviderRequest, 'signal' | 'onText'>) {
    this.requests.set(active.id, active);
    const promise = this.execute(active, provider, request);
    this.running.add(promise);
    void promise.finally(() => this.running.delete(promise));
  }

  cancel(id: string) {
    const request = this.requests.get(id);
    if (request?.status === 'running') request.controller.abort();
  }

  async dispose() {
    for (const request of this.requests.values()) request.controller.abort();
    await Promise.allSettled(this.running);
    this.requests.clear();
  }

  private async execute(active: ActiveRequest, provider: ProviderPort, request: Omit<ProviderRequest, 'signal' | 'onText'>) {
    let pending = '';
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let writeFailure: unknown;
    const flush = (status: LeoMessage['status'] = 'streaming') => {
      clearTimeout(flushTimer); flushTimer = undefined;
      if (!this.store.has(active.context)) return;
      if (!pending && status === 'streaming') return;
      const fragment = pending; pending = '';
      this.store.update(active.context, (document) => {
        const conversation = document.conversations.find((entry) => entry.id === active.conversationId);
        const message = conversation?.messages.find((entry) => entry.id === active.assistantId);
        if (!message || !conversation) return;
        message.content += fragment; message.status = status; conversation.updatedAt = Date.now();
      });
      this.publish(active.context);
    };
    const timeout = setTimeout(() => active.controller.abort(), 5 * 60 * 1000);
    try {
      await provider.send({
        ...request, signal: active.controller.signal,
        onText: (text) => {
          if (active.controller.signal.aborted) return;
          pending += text;
          if (!flushTimer) flushTimer = setTimeout(() => {
            try { flush(); } catch (error) { writeFailure = error; active.controller.abort(); }
          }, 80);
        },
      });
      if (writeFailure) throw writeFailure;
      if (active.controller.signal.aborted) throw new ProviderFailure('cancelled', '请求已取消');
      flush('completed');
      this.requests.delete(active.id);
    } catch (error) {
      const cancelled = active.controller.signal.aborted && !writeFailure;
      active.status = cancelled ? 'cancelled' : 'failed';
      active.error = cancelled ? '请求已取消' : error instanceof Error ? error.message : '模型请求失败';
      if (error instanceof ProviderFailure && error.kind === 'credentials' && this.store.has(active.context)) {
        try { this.invalidateKey(active.context, active.modelId); } catch { writeFailure = true; }
      }
      try { flush(cancelled ? 'cancelled' : 'failed'); }
      catch { active.error = '对话保存失败，请检查资料存储后重试'; }
    } finally {
      clearTimeout(timeout); clearTimeout(flushTimer);
      this.publish(active.context);
    }
  }
}
