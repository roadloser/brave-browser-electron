import { z } from 'zod';
import type { SignedTokenBatch } from './crypto-port';
import type { RewardsSignerPort } from '../provider-port';
import { BrowserError } from '../../../../shared/errors';

export interface AdsTokenProviderPort {
  request(endpoint: string, paymentId: string, seed: Uint8Array, blindedTokens: string[], signal: AbortSignal): Promise<string>;
  fetch(endpoint: string, paymentId: string, nonce: string, signal: AbortSignal): Promise<SignedTokenBatch>;
}
const signedSchema = z.object({
  publicKey: z.string().min(1).max(2048), batchProof: z.string().min(1).max(4096),
  signedTokens: z.array(z.string().min(1).max(4096)).min(1).max(100),
});

export class BraveAdsTokenProvider implements AdsTokenProviderPort {
  constructor(private readonly signer: RewardsSignerPort) {}

  async request(endpoint: string, paymentId: string, seed: Uint8Array, blindedTokens: string[], signal: AbortSignal) {
    const content = JSON.stringify({ blindedTokens });
    const digest = this.signer.headers(seed, 'primary', 'post', '/', content).digest;
    const signature = this.signer.signMessage(seed, `digest: ${digest}`);
    const headers = {
      digest, signature: `keyId="primary",algorithm="ed25519",headers="digest",signature="${signature}"`,
      'Content-Type': 'application/json', accept: 'application/json',
    };
    const response = await fetch(this.url(endpoint, paymentId), { method: 'POST', headers, body: content, signal, redirect: 'error' });
    const body = await this.body(response);
    return z.object({ nonce: z.string().min(1).max(256) }).parse(body).nonce;
  }

  async fetch(endpoint: string, paymentId: string, nonce: string, signal: AbortSignal): Promise<SignedTokenBatch> {
    const url = this.url(endpoint, paymentId);
    url.searchParams.set('nonce', nonce);
    const response = await fetch(url, { signal, redirect: 'error' });
    return signedSchema.parse(await this.body(response));
  }

  private url(endpoint: string, paymentId: string): URL {
    const base = new URL(endpoint);
    if (base.protocol !== 'https:' || base.username || base.password) throw new BrowserError('INVALID_ARGUMENT', '广告token服务需有效HTTPS地址');
    return new URL(`/v3/confirmation/token/${encodeURIComponent(paymentId)}`, base);
  }
  private async body(response: Response): Promise<unknown> {
    if (response.status === 401) throw new BrowserError('FORBIDDEN', '广告token服务要求验证码或重新授权，未自动绕过');
    if (response.status === 426) throw new BrowserError('UNAVAILABLE', '广告服务要求升级浏览器协议');
    if (!response.ok) throw new BrowserError('UNAVAILABLE', `广告token服务返回HTTP ${response.status}`, true, { status: response.status });
    const content = await response.text();
    if (content.length > 2 * 1024 * 1024) throw new BrowserError('UNAVAILABLE', '广告token响应超过大小上限');
    try { return JSON.parse(content); } catch { throw new BrowserError('UNAVAILABLE', '广告token响应格式无效'); }
  }
}
