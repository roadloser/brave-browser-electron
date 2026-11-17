import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { TranslationState } from '../../../shared/contracts/page-tools';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { PageTarget } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';
import type { TranslationAdapterPort, TranslationRuntimeState } from './providers/provider';
import { BraveTranslationAdapter } from './providers/brave-translation-adapter';

type Operation = { target: PageTarget; context: BrowserContext; controller: AbortController; timer?: ReturnType<typeof setTimeout> };

export class TranslationProvider {
  private readonly states = new Map<string, TranslationState>();
  private readonly operations = new Map<string, Operation>();
  private readonly adapter: TranslationAdapterPort;
  private readonly releases: Array<() => void>;
  private revision = 0;

  constructor(private readonly runtime: FeatureRuntime) {
    this.adapter = new BraveTranslationAdapter(runtime);
    this.releases = [
      runtime.core.onEvent((event) => {
        if (event.type === 'navigationCommitted') {
          const operation = this.operations.get(event.visit.tabId);
          if (operation && operation.target.navigationId !== event.visit.navigationId) {
            this.stopOperation(event.visit.tabId);
            this.states.delete(event.visit.tabId);
          }
        }
        if (event.type === 'tabClosed') {
          this.stopOperation(event.tabId); this.states.delete(event.tabId);
        }
        if (event.type === 'contextDisposed') {
          for (const [tabId, operation] of this.operations) if (operation.context.contextId === event.context.contextId) {
            this.stopOperation(tabId); this.states.delete(tabId);
          }
        }
      }),
    ];
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
    if (this.operations.has(tabId)) await this.cancel(tabId, false);
    const controller = new AbortController();
    const operation: Operation = {
      target: { tabId, navigationId: tab.navigationId, origin: new URL(tab.url).origin },
      context: tab, controller,
    };
    this.operations.set(tabId, operation);
    const contents = this.runtime.core.getTabWebContents(tabId);
    const excludedFrames = Math.max(0, contents.mainFrame.framesInSubtree.length - 1);
    this.publish(tabId, { ...this.state(tabId), targetLanguage, status: 'translating', excludedFrames, translatedFrames: 0, error: undefined });
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const result = await this.adapter.start(operation.target, targetLanguage, controller.signal);
      if (controller.signal.aborted || this.operations.get(tabId) !== operation) return this.state(tabId);
      clearTimeout(timeout);
      this.applyRuntime(tabId, result);
      if (result.status === 'translating') this.poll(tabId, operation);
    } catch (error) {
      if (this.operations.get(tabId) === operation) {
        const cancelled = controller.signal.aborted;
        this.publish(tabId, { ...this.state(tabId), status: cancelled ? 'cancelled' : 'failed',
          error: cancelled ? '翻译请求已取消或超时' : error instanceof Error ? error.message : '翻译失败' });
        this.stopOperation(tabId);
      }
    } finally {
      clearTimeout(timeout);
    }
    return this.state(tabId);
  }

  async cancel(tabId: string, undo: boolean) {
    const operation = this.operations.get(tabId);
    if (operation) this.stopOperation(tabId);
    const tab = this.runtime.core.getTab(tabId);
    const state = this.state(tabId);
    if (/^https?:/.test(tab.url)) {
      try {
        await this.adapter.restore({
          tabId, navigationId: tab.navigationId, origin: new URL(tab.url).origin,
        }, !undo);
      } catch (error) {
        this.publish(tabId, { ...state, status: 'failed', error: '恢复原文失败，请重新加载页面' });
        throw error;
      }
    }
    this.publish(tabId, { ...state, status: undo ? 'idle' : 'cancelled', translatedFrames: 0, error: undefined });
    return this.state(tabId);
  }

  async dispose() {
    for (const [tabId, operation] of this.operations) {
      this.stopOperation(tabId);
      await this.adapter.restore(operation.target, false).catch(() => undefined);
    }
    this.releases.forEach((release) => release());
    this.adapter.dispose();
    this.states.clear();
  }

  private poll(tabId: string, operation: Operation) {
    operation.timer = setTimeout(async () => {
      if (this.operations.get(tabId) !== operation || operation.controller.signal.aborted) return;
      try {
        const result = await this.adapter.state(operation.target);
        if (!result) throw new BrowserError('UNAVAILABLE', '翻译运行环境已失效，请重新加载页面');
        this.applyRuntime(tabId, result);
        if (result.status === 'translating') this.poll(tabId, operation);
      } catch (error) {
        this.publish(tabId, { ...this.state(tabId), status: 'failed', error: error instanceof Error ? error.message : '翻译状态读取失败' });
        this.stopOperation(tabId);
      }
    }, 250);
  }

  private applyRuntime(tabId: string, result: TranslationRuntimeState) {
    this.publish(tabId, { ...this.state(tabId), ...result, translatedFrames: result.status === 'translated' ? 1 : 0 });
  }

  private publish(tabId: string, state: TranslationState) {
    const tab = this.runtime.core.getTab(tabId);
    const next = { ...state, revision: ++this.revision };
    this.states.set(tabId, next);
    this.runtime.publish('pageTools.translationChanged', next, { windowId: tab.windowId });
  }

  private stopOperation(tabId: string) {
    const operation = this.operations.get(tabId);
    if (operation) { operation.controller.abort(); clearTimeout(operation.timer); }
    this.operations.delete(tabId);
  }
}
