import { nativeImage } from 'electron';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import type { NewsState } from '../../../shared/contracts/content-services';
import { BrowserError } from '../../../shared/errors';

export class NewsImageService {
  private readonly cache = new Map<string, { dataUrl: string; size: number }>();
  private readonly requests = new Map<string, { contextId: string; controller: AbortController; promise: Promise<{ dataUrl: string | null }> }>();
  private readonly release: () => void;
  private cacheBytes = 0;

  constructor(private readonly runtime: FeatureRuntime, private readonly getState: (context: CommandContext) => NewsState) {
    this.release = runtime.core.onEvent((event) => {
      if (event.type !== 'contextDisposed') return;
      for (const [key, request] of this.requests) if (request.contextId === event.context.contextId) {
        request.controller.abort(); this.requests.delete(key);
      }
      const prefix = event.context.contextId + ':';
      for (const [key, cached] of this.cache) if (key.startsWith(prefix)) {
        this.cacheBytes -= cached.size; this.cache.delete(key);
      }
    });
  }

  async get(context: CommandContext, articleId: string) {
    const state = this.getState(context);
    if (!state.enabled) throw new BrowserError('FORBIDDEN', '新闻已停用');
    const article = state.articles.find((entry) => entry.id === articleId);
    if (!article) throw new BrowserError('NOT_FOUND', '新闻文章已不在当前列表');
    if (!article.imageUrl) return { dataUrl: null };
    const url = new URL(article.imageUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return { dataUrl: null };
    const key = context.contextId + ':' + url.href;
    const cached = this.cache.get(key);
    if (cached) return { dataUrl: cached.dataUrl };
    const pending = this.requests.get(key);
    if (pending) return pending.promise;
    const controller = new AbortController();
    const promise = this.download(context, url.href, controller.signal).then((image) => {
      if (controller.signal.aborted) throw new BrowserError('CANCELLED', '图片请求已取消');
      if (image) this.remember(key, image);
      return { dataUrl: image?.dataUrl ?? null };
    }).finally(() => this.requests.delete(key));
    this.requests.set(key, { contextId: context.contextId, controller, promise });
    return promise;
  }

  dispose() {
    this.release(); this.requests.forEach((request) => request.controller.abort());
    this.requests.clear(); this.cache.clear(); this.cacheBytes = 0;
  }
  cancel(contextId: string) {
    for (const request of this.requests.values()) if (request.contextId === contextId) request.controller.abort();
  }

  private async download(context: CommandContext, url: string, signal: AbortSignal) {
    const response = await this.runtime.network.fetch(context, url, {
      purpose: 'news', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), credentials: 'omit', redirect: 'error',
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/') || !response.body) {
      await response.body?.cancel().catch(() => undefined); return null;
    }
    const maximum = 5 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > maximum) {
      await response.body.cancel().catch(() => undefined); return null;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > maximum) return null;
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    const image = nativeImage.createFromBuffer(Buffer.concat(chunks));
    if (image.isEmpty()) return null;
    const size = image.getSize();
    const scale = Math.min(1, 1600 / Math.max(size.width, size.height));
    const bytes = (scale < 1 ? image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) }) : image).toJPEG(82);
    return { dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, size: bytes.length };
  }

  private remember(key: string, image: { dataUrl: string; size: number }) {
    while (this.cacheBytes + image.size > 24 * 1024 * 1024 && this.cache.size) {
      const oldest = this.cache.keys().next().value!;
      this.cacheBytes -= this.cache.get(oldest)!.size; this.cache.delete(oldest);
    }
    this.cache.set(key, image); this.cacheBytes += image.size;
  }
}
