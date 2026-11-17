import { z } from 'zod';
import type { RewardsProviderName } from '../../../../shared/contracts/rewards';
import type { RewardsSignerPort } from '../provider-port';
import type { ProviderOperation, ProviderToken } from './provider-types';
import { providerJson } from './provider-http';
import { BrowserError } from '../../../../shared/errors';

export async function claimProvider(provider: RewardsProviderName, account: ProviderToken, grantEndpoint: string, paymentId: string, seed: Uint8Array, signer: RewardsSignerPort, operation: ProviderOperation): Promise<string> {
  const endpoint = new URL(grantEndpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new BrowserError('INVALID_ARGUMENT', 'Rewards服务地址无效');
  const path = `/v3/wallet/${provider}/${encodeURIComponent(paymentId)}/claim`;
  let content: string;
  if (provider === 'uphold') {
    const body = { denomination: { amount: '0', currency: 'BAT' }, destination: account.address };
    const octets = JSON.stringify(body); const digest = signer.headers(seed, 'primary', 'post', '/', octets).digest;
    const signature = `keyId="primary",algorithm="ed25519",headers="digest",signature="${signer.signMessage(seed, `digest: ${digest}`)}"`;
    content = JSON.stringify({ signedLinkingRequest: Buffer.from(JSON.stringify({ body, headers: { digest, signature }, octets })).toString('base64') });
  } else content = JSON.stringify(provider === 'bitflyer' ? { linkingInfo: account.linkingInfo } : { linking_info: account.linkingInfo });
  const headers = { ...(provider === 'uphold' ? {} : signer.headers(seed, paymentId, 'post', path, content)), 'content-type': 'application/json' };
  const result = z.object({ geoCountry: z.string().regex(/^[A-Z]{2}$/) }).parse(await providerJson(operation, new URL(path, endpoint), { method: 'POST', headers, body: content }, 200));
  return result.geoCountry;
}
