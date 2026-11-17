import { z } from 'zod';
import type { SignedTokenBatch } from './crypto-port';
import type { AdsFetch } from './ads-fetch';
import { adsJson } from './ads-fetch';
import { BrowserError } from '../../../../shared/errors';

export interface AdsConfirmationProviderPort {
  confirm(id: string, credential: string, payload: string, fetch: AdsFetch, signal: AbortSignal): Promise<void>;
  payment(id: string, fetch: AdsFetch, signal: AbortSignal): Promise<SignedTokenBatch>;
  redeem(paymentId: string, body: string, fetch: AdsFetch, signal: AbortSignal): Promise<void>;
}
const signatureSchema = z.object({ publicKey: z.string(), batchProof: z.string(), signedTokens: z.array(z.string()).length(1) });
export class BraveAdsConfirmationProvider implements AdsConfirmationProviderPort {
  async confirm(id: string, credential: string, payload: string, fetch: AdsFetch, signal: AbortSignal): Promise<void> {
    const response = await fetch(`https://anonymous.ads.brave.com/v3/confirmation/${encodeURIComponent(id)}/${encodeURIComponent(credential)}`, {
      method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: payload, signal,
    });
    await response.body?.cancel();
    if (!response.ok && response.status !== 418) throw new BrowserError(response.status === 401 || response.status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE', `广告匿名确认HTTP ${response.status}`, response.status >= 500, { status: response.status });
  }
  async payment(id: string, fetch: AdsFetch, signal: AbortSignal): Promise<SignedTokenBatch> {
    const response = await fetch(`https://anonymous.ads.brave.com/v3/confirmation/${encodeURIComponent(id)}/paymentToken`, { signal });
    const result = z.object({ id: z.string(), paymentToken: signatureSchema }).parse(await adsJson(response));
    if (result.id !== id) throw new BrowserError('FORBIDDEN', '广告paymentToken交易标识不匹配', false);
    return result.paymentToken;
  }
  async redeem(paymentId: string, body: string, fetch: AdsFetch, signal: AbortSignal): Promise<void> {
    const response = await fetch(`https://mywallet.ads.brave.com/v3/confirmation/payment/${encodeURIComponent(paymentId)}`, {
      method: 'PUT', headers: { accept: 'application/json', 'content-type': 'application/json' }, body, signal,
    });
    await response.body?.cancel();
    if (response.status !== 200) throw new BrowserError(response.status === 401 || response.status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE', `广告token兑换HTTP ${response.status}`, response.status >= 500, { status: response.status });
  }
}
