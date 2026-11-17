import { webFrameMain, type WebFrameMain } from 'electron';
import type { BrowserCorePort } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';

export type PageTarget = { tabId: string; navigationId: string; origin: string; frame?: { processId: number; routingId: number } };
export type PageScript = { world: 'isolated' | 'main' | 'translation'; source: (argumentsValue: unknown) => string };

export class PageScriptHost {
  private readonly scripts = new Map<string, PageScript>();

  constructor(private readonly core: BrowserCorePort) {}

  register(id: string, script: PageScript): () => void {
    if (this.scripts.has(id)) throw new BrowserError('CONFLICT', '页面能力重复注册');
    if (script.world === 'translation' && !id.startsWith('page-tools.translation.')) throw new BrowserError('FORBIDDEN', '翻译执行世界只用于已登记的翻译操作');
    this.scripts.set(id, script);
    return () => this.scripts.delete(id);
  }

  async execute<Result>(id: string, target: PageTarget, argumentsValue: unknown): Promise<Result> {
    const script = this.scripts.get(id);
    if (!script) throw new BrowserError('NOT_FOUND', '页面能力未注册');
    const tab = this.core.getTab(target.tabId);
    if (tab.navigationId !== target.navigationId) throw new BrowserError('CANCELLED', '页面已导航，操作取消');
    const contents = this.core.getTabWebContents(target.tabId);
    const frame = target.frame
      ? webFrameMain.fromId(target.frame.processId, target.frame.routingId)
      : contents.mainFrame;
    this.assertFrame(frame, target.origin, contents.mainFrame);
    const source = script.source(argumentsValue);
    if (script.world !== 'main' && frame !== contents.mainFrame) {
      throw new BrowserError('UNAVAILABLE', '当前运行时不提供子 frame 隔离世界执行接口');
    }
    const result = script.world === 'main'
      ? await frame.executeJavaScript(source, true)
      : await contents.executeJavaScriptInIsolatedWorld(script.world === 'translation' ? 1004 : 1001, [{ code: source }], true);
    if (this.core.getTab(target.tabId).navigationId !== target.navigationId) {
      throw new BrowserError('CANCELLED', '页面已导航，结果已丢弃');
    }
    return result as Result;
  }

  dispose(): void { this.scripts.clear(); }

  private assertFrame(frame: WebFrameMain | undefined, origin: string, mainFrame: WebFrameMain): asserts frame is WebFrameMain {
    if (!frame || frame.isDestroyed()) throw new BrowserError('CANCELLED', '目标 frame 已销毁');
    if (!mainFrame.framesInSubtree.includes(frame)) throw new BrowserError('FORBIDDEN', 'frame 不属于此标签');
    let actualOrigin: string;
    try { actualOrigin = new URL(frame.url).origin; } catch { throw new BrowserError('FORBIDDEN', '页面来源不可用'); }
    if (actualOrigin === 'null' || actualOrigin !== origin) throw new BrowserError('FORBIDDEN', '页面来源发生变化');
  }
}
