import { BrowserError } from '../../../shared/errors';

export class TranslationResource {
  private cached: { script: string; expires: number } | null = null;

  async get(fetch: (input: string, init?: RequestInit) => Promise<Response>, signal: AbortSignal): Promise<string> {
    if (this.cached && this.cached.expires > Date.now()) return this.cached.script;
    const url = new URL('https://translate.brave.com/static/v1/element.js');
    url.searchParams.set('cb', 'cr.googleTranslate.onTranslateElementLoad');
    url.searchParams.set('clc', 'cr.googleTranslate.onLoadCSS');
    url.searchParams.set('jlc', 'cr.googleTranslate.onLoadJavascript');
    url.searchParams.set('hl', 'zh-CN');
    const response = await fetch(url.href, {
      signal, credentials: 'omit', redirect: 'error',
      headers: { 'Google-Translate-Element-Mode': 'library' },
    });
    if (!response.ok) throw new BrowserError(response.status === 401 || response.status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE',
      `官方翻译资源请求失败（${response.status}）`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 2 * 1024 * 1024) throw new BrowserError('UNAVAILABLE', '官方翻译资源大小异常');
    const script = await response.text();
    if (script.length > 2 * 1024 * 1024 || !script.trim()) throw new BrowserError('UNAVAILABLE', '官方翻译资源无效');
    this.cached = { script, expires: Date.now() + 24 * 60 * 60 * 1000 };
    return script;
  }

  clear() { this.cached = null; }
}
