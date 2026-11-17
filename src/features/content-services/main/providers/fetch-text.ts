import type { ContentFetch } from './provider';
import { BrowserError } from '../../../../shared/errors';

export async function fetchText(fetch: ContentFetch, url: string, signal: AbortSignal, limit = 8 * 1024 * 1024) {
  const target = new URL(url);
  if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw new BrowserError('INVALID_ARGUMENT', '来源网址必须是 HTTP 或 HTTPS');
  const response = await fetch(target.href, { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new BrowserError('UNAVAILABLE', `内容服务返回 ${response.status}`);
  if (!response.body) throw new BrowserError('UNAVAILABLE', '内容服务没有返回正文');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > limit) throw new BrowserError('UNAVAILABLE', '内容超过可处理大小');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return { text: Buffer.concat(chunks).toString('utf8'), etag: response.headers.get('etag') ?? undefined };
}
