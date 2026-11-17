import { BrowserError } from '../../../../shared/errors';
export { contextRewardsFetch as contextAdsFetch } from '../rewards-network';
export type { RewardsFetch as AdsFetch } from '../rewards-network';

export async function adsJson(response: Response, limit = 2 * 1024 * 1024): Promise<unknown> {
  if (response.status === 401 || response.status === 403) throw new BrowserError('FORBIDDEN', '广告服务要求资格确认或验证码');
  if (response.status === 426) throw new BrowserError('UNAVAILABLE', '广告服务要求升级客户端协议');
  if (!response.ok) throw new BrowserError('UNAVAILABLE', `广告服务HTTP ${response.status}`, response.status >= 500, { status: response.status });
  const reader = response.body?.getReader();
  if (!reader) throw new BrowserError('UNAVAILABLE', '广告服务响应为空');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) throw new BrowserError('UNAVAILABLE', '广告服务响应超过大小上限');
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
