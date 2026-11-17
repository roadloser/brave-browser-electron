import { setTimeout as delay } from 'node:timers/promises';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { ContextNetworkPort } from '../../../../shared/network-ports';
import { BrowserError } from '../../../../shared/errors';

export class SkuHttpClient {
  constructor(private readonly network: ContextNetworkPort) {}
  async request(context: BrowserContext, method: 'GET' | 'PUT', path: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
    if (!/^\/v1\/orders\/[0-9a-f-]+(?:\/credentials\/items\/[0-9a-f-]+\/batches\/[0-9a-f-]+)?$/i.test(path)) throw new BrowserError('FORBIDDEN', '账户协议请求路径不受支持');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      signal.throwIfAborted();
      const response = await this.network.fetch(context, `https://payment.rewards.brave.com${path}`, {
        purpose: 'vpn', method, signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
      });
      if ([202, 429, 500, 502, 503, 504].includes(response.status)) {
        const retry = Number(response.headers.get('retry-after') ?? '0');
        await response.body?.cancel();
        if (attempt === 3 || !Number.isFinite(retry) || retry > 10) throw new BrowserError('UNAVAILABLE', '账户授权仍在处理，请稍后重试');
        await delay(Math.max(250 * 2 ** attempt, retry * 1000), undefined, { signal });
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new BrowserError(response.status === 409 ? 'CONFLICT' : response.status === 401 || response.status === 403 ? 'FORBIDDEN' : response.status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE', `账户授权服务未接受请求（HTTP ${response.status}）`);
      }
      const reader = response.body?.getReader();
      if (!reader) return null;
      let length = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > 4_000_000) throw new BrowserError('UNAVAILABLE', '账户授权响应超出支持大小');
          chunks.push(next.value);
        }
        if (!length && method === 'PUT') return null;
        try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new BrowserError('UNAVAILABLE', '账户授权响应格式无效'); }
      } finally { await reader.cancel().catch(() => undefined); }
    }
    throw new BrowserError('UNAVAILABLE', '账户授权请求未完成');
  }
}
