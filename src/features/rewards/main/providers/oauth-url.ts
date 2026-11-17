import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RewardsProviderName } from '../../../../shared/contracts/rewards';
import type { OAuthSession } from './provider-types';
import { BrowserError } from '../../../../shared/errors';

export const gate3 = 'https://gate3.wallet.brave.com';
const origins = { uphold: 'wallet.uphold.com', bitflyer: 'bitflyer.com', zebpay: 'connect.zebpay.com' };
export function createOAuth(provider: RewardsProviderName): OAuthSession {
  return { provider, state: randomBytes(32).toString('hex').toUpperCase(), verifier: Buffer.from(randomBytes(32).toString('hex').toUpperCase()).toString('base64url'), startedAt: Date.now() };
}
export function oauthUrl(session: OAuthSession): string {
  const url = new URL(`/api/oauth/${session.provider}/production/auth`, gate3);
  if (session.provider === 'uphold') {
    url.searchParams.set('scope', 'cards:read cards:write user:read transactions:read transactions:transfer:application transactions:transfer:others');
    url.searchParams.set('intention', 'login'); url.searchParams.set('state', session.state);
  } else if (session.provider === 'bitflyer') {
    url.searchParams.set('scope', 'assets create_deposit_id withdraw_to_deposit_id'); url.searchParams.set('state', session.state);
    url.searchParams.set('response_type', 'code'); url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', createHash('sha256').update(session.verifier).digest('base64url'));
  } else {
    const query = new URLSearchParams({ grant_type: 'authorization_code', response_type: 'code', scope: 'openid profile', state: session.state });
    url.searchParams.set('returnUrl', `/connect/authorize/callback?${query}`);
  }
  return url.href;
}
export function oauthCallback(session: OAuthSession, target: string, source: string): string | null {
  const callback = new URL(target);
  if (callback.protocol !== 'rewards:') return null;
  if (callback.hostname !== session.provider || callback.pathname !== '/authorization') throw new BrowserError('FORBIDDEN', '收款账户回调目标不匹配', false);
  const origin = new URL(source);
  const allowed = [new URL(gate3).hostname, origins[session.provider]];
  if (origin.protocol !== 'https:' || !allowed.some(host => origin.hostname === host || origin.hostname.endsWith(`.${host}`))) throw new BrowserError('FORBIDDEN', '收款账户回调来源不受信任', false);
  const expected = Buffer.from(session.state); const actual = Buffer.from(callback.searchParams.get('state') ?? '');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new BrowserError('FORBIDDEN', '收款账户授权state不匹配', false);
  if (Date.now() - session.startedAt > 10 * 60_000) throw new BrowserError('CANCELLED', '收款账户授权已过期');
  if (callback.searchParams.has('error')) {
    const description = callback.searchParams.get('error_description') ?? '';
    throw new BrowserError('FORBIDDEN', description.includes('minimum requirements') ? '收款账户需要完成身份认证' : description.includes('geolocation') ? '收款服务暂不支持此地区' : '用户取消授权或收款服务拒绝连接', false);
  }
  const code = callback.searchParams.get('code');
  if (!code || code.length > 8192) throw new BrowserError('INVALID_ARGUMENT', '收款账户回调缺少有效授权码');
  return code;
}
