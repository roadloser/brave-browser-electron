import { z } from 'zod';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { VpnRegion } from '../../../shared/contracts/vpn';
import type { ContextNetworkPort } from '../../../shared/network-ports';
import { BrowserError } from '../../../shared/errors';
import type { VpnCredentialInput, VpnEndpointCredential, VpnProviderPort } from './provider-port';

const accountOrigin = 'https://connect-api.guardianapp.com';
const regionSchema = z.object({ name: z.string().min(1).max(200), 'name-pretty': z.string().min(1).max(200), 'country-iso-code': z.string().min(2).max(3), 'region-precision': z.enum(['country', 'city']) });
const regionsSchema = z.array(regionSchema.extend({ cities: z.array(regionSchema).optional() })).max(1000);
const hostsSchema = z.array(z.object({ hostname: z.string().min(1).max(253), 'display-name': z.string(), offline: z.boolean(), 'capacity-score': z.number().int() })).max(1000);
const credentialsSchema = z.object({ 'eap-username': z.string().min(1).max(4096), 'eap-password': z.string().min(1).max(16384), 'client-id': z.string().optional(), 'api-auth-token': z.string().optional() });

function guardianHostname(value: string): string {
  const hostname = value.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) || !['guardianapp.com', 'sudosecuritygroup.com'].some(domain => hostname.endsWith(`.${domain}`))) {
    throw new BrowserError('FORBIDDEN', 'VPN目录返回了不属于已支持供应商的服务器');
  }
  return hostname;
}

export class GuardianProvider implements VpnProviderPort {
  constructor(private readonly network: ContextNetworkPort) {}

  async authorize(context: BrowserContext, input: VpnCredentialInput, signal: AbortSignal): Promise<string> {
    if (input.kind === 'subscriber') return input.value;
    const response = await this.request(context, `${accountOrigin}/api/v1.2/subscriber-credential/create`, signal, {
      'validation-method': 'brave-premium', 'brave-vpn-premium-monthly-pass': input.value,
    });
    const result = z.object({ 'subscriber-credential': z.string().min(1).max(65536) }).safeParse(response);
    if (!result.success) throw new BrowserError('UNAVAILABLE', '供应商未返回有效订阅凭据');
    return result.data['subscriber-credential'];
  }

  async regions(context: BrowserContext, signal: AbortSignal): Promise<VpnRegion[]> {
    const parsed = regionsSchema.safeParse(await this.request(context, `${accountOrigin}/api/v1.3/servers/all-server-regions/city-by-country`, signal));
    if (!parsed.success) throw new BrowserError('UNAVAILABLE', 'VPN地区目录格式变化，尚不能安全读取');
    const regions: VpnRegion[] = [];
    for (const region of parsed.data) {
      regions.push({ id: region.name, name: region['name-pretty'], country: region['country-iso-code'], precision: region['region-precision'] });
      for (const city of region.cities ?? []) regions.push({ id: city.name, name: `${region['name-pretty']} · ${city['name-pretty']}`, country: city['country-iso-code'], precision: city['region-precision'], parentId: region.name });
    }
    return [...new Map(regions.map(region => [region.id, region])).values()];
  }

  async credentials(context: BrowserContext, subscriber: string, region: VpnRegion, signal: AbortSignal): Promise<VpnEndpointCredential> {
    const hostResponse = await this.request(context, `${accountOrigin}/api/v1.3/servers/hostnames-for-region`, signal, { region: region.id, 'region-precision': region.precision });
    const hosts = hostsSchema.safeParse(hostResponse);
    if (!hosts.success) throw new BrowserError('UNAVAILABLE', 'VPN服务器目录格式变化，尚不能安全连接');
    const selected = hosts.data.filter(host => !host.offline).sort((left, right) => right['capacity-score'] - left['capacity-score'])[0];
    if (!selected) throw new BrowserError('UNAVAILABLE', '所选地区没有在线VPN服务器');
    const hostname = guardianHostname(selected.hostname);
    const parsed = credentialsSchema.safeParse(await this.request(context, `https://${hostname}/api/v1.4/device-credentials`, signal, { 'subscriber-credential': subscriber, 'transport-protocol': 'ikev2' }));
    if (!parsed.success) throw new BrowserError('UNAVAILABLE', '供应商未返回完整IKEv2授权信息，请确认订阅资格');
    return { hostname, username: parsed.data['eap-username'], password: parsed.data['eap-password'], clientId: parsed.data['client-id'], apiAuthToken: parsed.data['api-auth-token'] };
  }

  private async request(context: BrowserContext, url: string, signal: AbortSignal, body?: Record<string, string>): Promise<unknown> {
    const response = await this.network.fetch(context, url, {
      purpose: 'vpn', method: body ? 'POST' : 'GET', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new BrowserError(response.status === 401 || response.status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE', `VPN供应商请求被拒绝（HTTP ${response.status}），未改变系统连接`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new BrowserError('UNAVAILABLE', 'VPN供应商响应为空');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > 2_000_000) throw new BrowserError('UNAVAILABLE', 'VPN供应商响应超出支持大小');
        chunks.push(next.value);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new BrowserError('UNAVAILABLE', 'VPN供应商响应不是有效JSON'); }
    } finally { await reader.cancel().catch(() => undefined); }
  }
}
