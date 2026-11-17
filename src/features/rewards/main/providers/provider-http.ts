import { BrowserError } from '../../../../shared/errors';
import type { ProviderOperation } from './provider-types';

export async function providerJson(operation: ProviderOperation, url: string | URL, init: RequestInit = {}, expectedStatus?: number): Promise<unknown> {
  const response = await operation.fetch(url, { ...init, signal: operation.signal, redirect: 'error' });
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) throw new BrowserError('UNAVAILABLE', '收款服务响应超过限制', false);
  if (response.status === 401) throw new BrowserError('FORBIDDEN', '收款账户凭据已失效，请重新登录', false, { status: response.status });
  if (!response.ok || expectedStatus !== undefined && response.status !== expectedStatus) {
    let message = `收款服务HTTP ${response.status}`;
    try {
      const error = JSON.parse(text) as { message?: string };
      const descriptions: [string, string][] = [['KYC required', '请先完成收款账户身份认证'], ['mismatched provider accounts', '收款账户与既有绑定不一致'], ['region not supported', '收款服务不支持此地区'], ['mismatched provider account regions', '收款账户地区与Rewards地区不一致'], ['unusual activity', '服务要求核实账户活动'], ['is temporarily unavailable', '收款服务暂时不可用']];
      message = descriptions.find(([match]) => error.message?.includes(match))?.[1] ?? message;
    } catch {}
    if (response.status === 409) message = '收款账户已达到服务允许的设备连接上限';
    if (response.status === 404) message = '收款服务未找到所需账户或身份认证资料';
    throw new BrowserError(response.status < 500 ? 'FORBIDDEN' : 'UNAVAILABLE', message, response.status >= 500, { status: response.status });
  }
  try { return JSON.parse(text); } catch { throw new BrowserError('UNAVAILABLE', '收款服务响应不是有效JSON', false); }
}
export function bearer(token: string): Record<string, string> { return { Authorization: `Bearer ${token}`, accept: 'application/json' }; }
