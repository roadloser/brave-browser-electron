import { z } from 'zod';
import type { RewardsProviderConfiguration, RewardsProviderPort, RewardsSignerPort, RewardsWalletStatus } from './provider-port';
import { BrowserError } from '../../../shared/errors';

const registrationSchema = z.object({ paymentId: z.string().min(1).max(128) });
const walletSchema = z.object({
  depositAccountProvider: z.object({ name: z.string(), id: z.string(), linkingId: z.string() }).optional(),
  selfCustodyAvailable: z.record(z.string(), z.boolean()).optional(),
});

export class BraveRewardsProvider implements RewardsProviderPort {
  readonly id = 'brave-rewards-v4';
  constructor(private readonly signer: RewardsSignerPort) {}

  async register(configuration: RewardsProviderConfiguration, seed: Uint8Array, country: string, signal: AbortSignal) {
    const path = '/v4/wallets';
    const content = JSON.stringify({ geoCountry: country });
    const result = await this.request(configuration, path, 'POST', content, this.signer.publicKeyHex(seed), seed, signal);
    return registrationSchema.parse(result);
  }

  async wallet(configuration: RewardsProviderConfiguration, seed: Uint8Array, paymentId: string, signal: AbortSignal): Promise<RewardsWalletStatus> {
    const path = `/v4/wallets/${encodeURIComponent(paymentId)}`;
    const result = walletSchema.parse(await this.request(configuration, path, 'GET', '', paymentId, seed, signal));
    const provider = result.depositAccountProvider ?? null;
    return { provider, linked: Boolean(provider?.id && provider.linkingId), selfCustodyAvailable: result.selfCustodyAvailable ?? {} };
  }

  async selfCustodyChallenge(configuration: RewardsProviderConfiguration, seed: Uint8Array, paymentId: string, signal: AbortSignal) {
    const challenge = z.object({ challengeId: z.string().min(1).max(256) }).parse(await this.request(
      configuration, '/v3/wallet/challenges', 'POST', JSON.stringify({ paymentId }), paymentId, seed, signal, true,
    ));
    const message = `${paymentId.toLowerCase()}.${challenge.challengeId}`;
    const signature = this.signer.signMessage(seed, message).replaceAll('+', '-').replaceAll('/', '_');
    const url = new URL('https://rewards.brave.com/connect/');
    url.searchParams.set('msg', message); url.searchParams.set('sig', signature);
    return { challengeId: challenge.challengeId, url: url.href };
  }

  private async request(configuration: RewardsProviderConfiguration, path: string, method: string, content: string,
    keyId: string, seed: Uint8Array, signal: AbortSignal, anySuccess = false): Promise<unknown> {
    const endpoint = new URL(configuration.grantEndpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new BrowserError('INVALID_ARGUMENT', 'Rewards服务需要有效HTTPS地址');
    const url = new URL(path, endpoint);
    const headers: Record<string, string> = {
      ...this.signer.headers(seed, keyId, method, path, content), 'Content-Type': 'application/json',
    };
    if (configuration.serviceKey) headers['x-brave-key'] = configuration.serviceKey;
    const response = await fetch(url, { method, headers, body: method === 'GET' ? undefined : content, signal, redirect: 'error' });
    if (response.status === 401 || response.status === 403) throw new BrowserError('FORBIDDEN', 'Rewards服务拒绝资格或签名，请核实服务配置与账户状态', true, { status: response.status });
    if (response.status === 409) throw new BrowserError('CONFLICT', 'Rewards钱包可能已注册；请保留恢复种子并恢复原paymentId，不重复创建', true, { status: response.status });
    if (response.status === 404) throw new BrowserError('NOT_FOUND', 'Rewards服务未找到该paymentId', true, { status: response.status });
    if (anySuccess ? !response.ok : response.status !== (method === 'POST' ? 201 : 200)) throw new BrowserError('UNAVAILABLE', `Rewards服务返回HTTP ${response.status}`, true, { status: response.status });
    const body = await response.text();
    if (body.length > 2 * 1024 * 1024) throw new BrowserError('UNAVAILABLE', 'Rewards响应超过允许大小');
    try { return JSON.parse(body); } catch { throw new BrowserError('UNAVAILABLE', 'Rewards服务响应格式无效'); }
  }
}
