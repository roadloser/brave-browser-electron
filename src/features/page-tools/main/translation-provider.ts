import type { TranslationState } from '../../../shared/contracts/page-tools';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import type { TranslationAdapterPort, TranslationRuntimeState } from './providers/provider';
import { BraveTranslationAdapter } from './providers/brave-translation-adapter';
import { TranslationLifecycle, type TranslationOperation } from './translation-lifecycle';

export class TranslationProvider {
  private readonly states = new Map<string, TranslationState>();
  private readonly adapter: TranslationAdapterPort;
  private readonly lifecycle: TranslationLifecycle;
  private readonly release: () => void;
  private revision = 0;

  constructor(private readonly runtime: FeatureRuntime) {
    this.adapter = new BraveTranslationAdapter(runtime);
    this.lifecycle = new TranslationLifecycle(this.adapter);
    this.release = runtime.core.onEvent((event) => {
      if (event.type === 'navigationCommitted') {
        void this.lifecycle.navigation(event.visit).then((result) => {
          if (result.changed && !this.lifecycle.current(event.visit.tabId)) {
            this.states.delete(event.visit.tabId);
            this.publish(event.visit.tabId, { ...this.state(event.visit.tabId),
              status: result.error ? 'failed' : 'idle', error: result.error });
          }
        }).catch(() => undefined);
      }
      if (event.type === 'tabClosed') { this.lifecycle.close(event.tabId); this.states.delete(event.tabId); }
      if (event.type === 'contextDisposed') for (const tabId of this.lifecycle.closeContext(event.context.contextId)) this.states.delete(tabId);
    });
  }

  state(tabId: string): TranslationState {
    const tab = this.runtime.core.getTab(tabId);
    const existing = this.states.get(tabId);
    if (existing?.navigationId === tab.navigationId) return { ...existing };
    return { tabId, navigationId: tab.navigationId, sourceLanguage: 'auto', targetLanguage: 'zh-CN',
      status: 'idle', translatedFrames: 0, excludedFrames: 0, revision: this.revision };
  }

  async translate(tabId: string, targetLanguage: string): Promise<TranslationState> {
    const tab = this.runtime.core.getTab(tabId);
    if (!/^https?:/.test(tab.url)) throw new BrowserError('UNAVAILABLE', '此页面不支持翻译');
    if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(targetLanguage)) throw new BrowserError('INVALID_ARGUMENT', '目标语言无效');
    const availability = this.adapter.available();
    if (!availability.available) throw new BrowserError('FORBIDDEN', availability.reason!, true, { capability: 'official-translation-credentials' });
    const operation = this.lifecycle.begin(tab);
    const contents = this.runtime.core.getTabWebContents(tabId);
    const excludedFrames = Math.max(0, contents.mainFrame.framesInSubtree.length - 1);
    this.publish(tabId, { ...this.state(tabId), targetLanguage, status: 'translating', excludedFrames, translatedFrames: 0, error: undefined });
    const timeout = setTimeout(() => operation.controller.abort(), 25000);
    try {
      const result = await this.adapter.start(operation.target, targetLanguage, operation.controller.signal, operation.generation);
      if (!this.lifecycle.isCurrent(operation)) {
        await this.adapter.restore(operation.target, true, operation.generation).catch(() => undefined);
        return this.state(tabId);
      }
      this.applyRuntime(tabId, result);
      if (result.status === 'translating' || result.status === 'translated') this.poll(tabId, operation);
    } catch (error) {
      if (this.lifecycle.current(tabId) === operation) {
        const cancelled = operation.controller.signal.aborted;
        let restorationError: string | undefined;
        await this.lifecycle.rollback(operation).catch((failure) => { restorationError = failure instanceof Error ? failure.message : '恢复原文失败，请重新加载页面'; });
        if (!this.lifecycle.current(tabId)) this.publish(tabId, {
          ...this.state(tabId), status: restorationError ? 'failed' : cancelled ? 'cancelled' : 'failed',
          error: restorationError ?? (cancelled ? '翻译请求已取消或超时' : error instanceof Error ? error.message : '翻译失败'),
        });
      }
    } finally { clearTimeout(timeout); }
    return this.state(tabId);
  }

  async cancel(tabId: string, undo: boolean) {
    try {
      await this.lifecycle.cancel(tabId, undo);
      if (!this.lifecycle.current(tabId)) this.publish(tabId, { ...this.state(tabId), status: undo ? 'idle' : 'cancelled', translatedFrames: 0, error: undefined });
    } catch (error) {
      if (!this.lifecycle.current(tabId)) this.publish(tabId, { ...this.state(tabId), status: 'failed', error: '恢复原文失败，请重新加载页面' });
      throw error;
    }
    return this.state(tabId);
  }

  async dispose() {
    this.release(); await this.lifecycle.dispose(); this.adapter.dispose(); this.states.clear();
  }

  private poll(tabId: string, operation: TranslationOperation) {
    operation.timer = setTimeout(async () => {
      if (!this.lifecycle.isCurrent(operation)) return;
      try {
        const result = await this.adapter.state(operation.target, operation.generation);
        if (!this.lifecycle.isCurrent(operation)) return;
        if (!result) throw new BrowserError('UNAVAILABLE', '翻译运行环境已失效，请重新加载页面');
        const current = this.state(tabId);
        if (result.status !== current.status || result.error !== current.error || result.sourceLanguage !== current.sourceLanguage) this.applyRuntime(tabId, result);
        if (result.status === 'translating' || result.status === 'translated') this.poll(tabId, operation);
      } catch (error) {
        if (this.lifecycle.current(tabId) !== operation) return;
        let message = error instanceof Error ? error.message : '翻译状态读取失败';
        await this.lifecycle.rollback(operation).catch(() => { message = '恢复原文失败，请重新加载页面'; });
        if (!this.lifecycle.current(tabId)) this.publish(tabId, { ...this.state(tabId), status: 'failed', error: message });
      }
    }, this.state(tabId).status === 'translated' ? 1000 : 250);
  }

  private applyRuntime(tabId: string, result: TranslationRuntimeState) {
    this.publish(tabId, { ...this.state(tabId), ...result, translatedFrames: result.status === 'translated' ? 1 : 0 });
  }
  private publish(tabId: string, state: TranslationState) {
    let windowId: string;
    try { windowId = this.runtime.core.getTab(tabId).windowId; } catch { return; }
    const next = { ...state, revision: ++this.revision };
    this.states.set(tabId, next);
    this.runtime.publish('pageTools.translationChanged', next, { windowId });
  }
}
