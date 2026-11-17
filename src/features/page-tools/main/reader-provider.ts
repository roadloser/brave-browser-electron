import type { ReaderArticle } from '../../../shared/contracts/page-tools';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import type { ReaderAdapterPort } from './providers/provider';
import { ReadabilityAdapter } from './providers/readability-adapter';

export class ReaderProvider {
  private readonly adapter: ReaderAdapterPort;
  constructor(private readonly runtime: FeatureRuntime) {
    this.adapter = new ReadabilityAdapter(runtime);
  }
  async read(tabId: string): Promise<ReaderArticle> {
    const tab = this.runtime.core.getTab(tabId);
    if (!/^https?:/.test(tab.url)) throw new BrowserError('UNAVAILABLE', '此页面不支持阅读模式');
    const article = await this.adapter.extract({ tabId, navigationId: tab.navigationId, origin: new URL(tab.url).origin });
    if (!article) throw new BrowserError('UNAVAILABLE', '没有找到可供阅读的正文，请继续浏览原页面');
    if (this.runtime.core.getTab(tabId).navigationId !== tab.navigationId) throw new BrowserError('CANCELLED', '页面已改变，请重新打开阅读模式');
    return { ...article, tabId, navigationId: tab.navigationId };
  }
  dispose() { this.adapter.dispose(); }
}
