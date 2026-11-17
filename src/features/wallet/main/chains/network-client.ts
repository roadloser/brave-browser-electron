import { net } from 'electron';
import { BrowserError } from '../../../../shared/errors';

export function safeNetworkUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.hash) throw new BrowserError('INVALID_ARGUMENT', '网络地址不能包含密码或片段');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new BrowserError('INVALID_ARGUMENT', '链网络需要 HTTPS，本机开发节点可使用 HTTP');
  }
  return url;
}
export async function networkFetch(url: string, init: RequestInit = {}) {
  safeNetworkUrl(url);
  const response = await net.fetch(url, { ...init, credentials: 'omit', redirect: 'error', signal: init.signal ?? AbortSignal.timeout(20000) });
  if (!response.ok) throw new BrowserError('UNAVAILABLE', `链服务返回 ${response.status}`, true, { status: response.status });
  return response;
}
export async function rpc<Result>(url: string, method: string, params: unknown[]): Promise<Result> {
  const response = await networkFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }) });
  const data = await response.json() as { result?: Result; error?: { code?: number; message?: string } };
  if (data.error) throw new BrowserError('UNAVAILABLE', `链节点拒绝请求（${data.error.code ?? 'RPC'}）`);
  if (data.result === undefined) throw new BrowserError('UNAVAILABLE', '链节点响应格式无效');
  return data.result;
}
export function amountToBase(value: string, decimals: number) {
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new BrowserError('INVALID_ARGUMENT', '金额小数位超出该网络精度');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}
export function formatAmount(value: string, decimals: number) {
  const amount = BigInt(value);
  const factor = 10n ** BigInt(decimals);
  const fraction = (amount % factor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${amount / factor}${fraction ? '.' + fraction : ''}`;
}
