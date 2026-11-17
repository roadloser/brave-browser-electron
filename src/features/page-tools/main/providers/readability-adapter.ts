import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { PageTarget } from '../../../../shared/runtime-ports';
import type { ExtractedArticle, ReaderAdapterPort } from './provider';
import { extractArticleSource } from '../../page/extract-article';

export class ReadabilityAdapter implements ReaderAdapterPort {
  readonly capability = {
    implementation: 'mozilla-readability', version: '0.6.0+dompurify-3.4.17',
    scope: 'main-frame' as const, limitations: ['正文提取算法与 Brave Speedreader 不完全相同', '不合并子框架正文'],
  };
  private readonly release: () => void;
  constructor(private readonly runtime: FeatureRuntime) {
    this.release = runtime.pages.register('page-tools.reader', { world: 'isolated', source: extractArticleSource });
  }
  extract(target: PageTarget) {
    return this.runtime.pages.execute<ExtractedArticle | null>('page-tools.reader', target, {});
  }
  dispose() { this.release(); }
}
