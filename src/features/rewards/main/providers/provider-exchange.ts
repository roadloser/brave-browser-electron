import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OAuthSession, ProviderOperation, ProviderToken } from './provider-types';
import { gate3 } from './oauth-url';
import { providerJson } from './provider-http';
import { BrowserError } from '../../../../shared/errors';

export async function exchangeProviderCode(session: OAuthSession, code: string, paymentId: string, operation: ProviderOperation): Promise<ProviderToken> {
  const headers: Record<string, string> = { 'content-type': session.provider === 'bitflyer' ? 'application/json' : 'application/x-www-form-urlencoded' };
  if (operation.serviceKey) headers['x-brave-key'] = operation.serviceKey;
  const form = new URLSearchParams({ code, grant_type: 'authorization_code' });
  if (session.provider === 'zebpay') form.set('redirect_uri', 'rewards://zebpay/authorization');
  const body = session.provider === 'bitflyer' ? JSON.stringify({ grant_type: 'code', code, code_verifier: session.verifier, expires_in: 259002,
    external_account_id: createHash('sha256').update(paymentId).digest('hex').toUpperCase(), request_id: randomUUID(), redirect_uri: 'rewards://bitflyer/authorization', request_deposit_id: true }) : form.toString();
  const result = z.object({ access_token: z.string().min(1).max(32768), deposit_id: z.string().optional(), linking_info: z.string().max(65536).optional() }).parse(await providerJson(operation,
    new URL(`/api/oauth/${session.provider}/production/token`, gate3), { method: 'POST', headers, body }, session.provider === 'uphold' ? undefined : 200));
  if (session.provider === 'uphold') return { token: result.access_token };
  if (!result.linking_info) throw new BrowserError('UNAVAILABLE', '收款服务未返回连接证明', false);
  let address = result.deposit_id;
  if (session.provider === 'zebpay') {
    const pieces = result.linking_info.split('.');
    if (pieces.length !== 3) throw new BrowserError('UNAVAILABLE', 'ZebPay连接证明格式无效', false);
    address = z.object({ depositId: z.string().min(1).max(256) }).parse(JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'))).depositId;
  }
  if (!address) throw new BrowserError('UNAVAILABLE', '收款服务未返回收款标识', false);
  return { token: result.access_token, linkingInfo: result.linking_info, address };
}
