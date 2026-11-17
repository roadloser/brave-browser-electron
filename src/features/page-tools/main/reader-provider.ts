import type { ReaderArticle } from '../../../shared/contracts/page-tools';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { extractArticleSource } from '../page/extract-article';

export class ReaderProvider {
  private readonly release: () => void;
  constructor(private readonly runtime: FeatureRuntime) {
    this.release = runtime.pages.register('page-tools.reader', { world: 'isolated', source: extractArticleSource });
  }
  async read(tabId: string): Promise<ReaderArticle> {
    const tab = this.runtime.core.getTab(tabId);
    if (!/^https?:/.test(tab.url)) throw new BrowserError('UNAVAILABLE', '此页面不支持阅读模式');
    const article = await this.runtime.pages.execute<Omit<ReaderArticle, 'tabId' | 'navigationId'> | null>(
      'page-tools.reader', { tabId, navigationId: tab.navigationId, origin: new URL(tab.url).origin }, {},
    );
    if (!article) throw new BrowserError('UNAVAILABLE', '没有找到可供阅读的正文，请继续浏览原页面');
    if (this.runtime.core.getTab(tabId).navigationId !== tab.navigationId) throw new BrowserError('CANCELLED', '页面已改变，请重新打开阅读模式');
    return { ...article, tabId, navigationId: tab.navigationId };
  }
  dispose() { this.release(); }
}
