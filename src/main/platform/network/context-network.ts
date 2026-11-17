import type { BrowserCorePort } from '../../../shared/runtime-ports';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { ContextNetworkPort } from '../../../shared/network-ports';
import type { NetworkPurpose } from '../../../shared/network-ports';
import { BrowserError } from '../../../shared/errors';

function localDestination(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' ||
    host === '0.0.0.0' || /^127\./.test(host) || /^10\./.test(host) || host.startsWith('::ffff:') ||
    /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) || (host.includes(':') && /^(fc|fd|fe80:)/i.test(host));
}

export class ContextNetwork implements ContextNetworkPort {
  constructor(private readonly core: BrowserCorePort) {}
  async fetch(context: BrowserContext, input: string, init?: RequestInit & { purpose: NetworkPurpose }): Promise<Response> {
    const actual = this.core.getContexts().find(candidate => candidate.contextId === context.contextId);
    if (!actual || actual.profileId !== context.profileId || actual.isPrivate !== context.isPrivate) throw new BrowserError('FORBIDDEN', '网络请求上下文已失效或不匹配');
    const url = new URL(input);
    if (url.username || url.password || url.hash) throw new BrowserError('INVALID_ARGUMENT', '网络请求地址不能包含内嵌凭据或片段');
    const local = localDestination(url.hostname);
    const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost && actual.kind !== 'tor')) throw new BrowserError('FORBIDDEN', '网络请求只允许HTTPS或普通上下文的localhost HTTP');
    if (actual.kind === 'tor' && local) throw new BrowserError('FORBIDDEN', 'Tor 上下文不允许连接本地服务地址');
    const session = this.core.sessionForContext(actual);
    if (actual.kind === 'tor') {
      const route = await session.resolveProxy(url.href);
      if (!/^SOCKS5 127\.0\.0\.1:\d+$/.test(route.trim())) throw new BrowserError('UNAVAILABLE', 'Tor 代理尚未就绪，附属请求已阻断');
    }
    const headers = new Headers(init?.headers);
    headers.delete('Cookie'); headers.delete('Proxy-Authorization'); headers.delete('Host');
    const { purpose: _purpose, ...options } = init ?? {};
    return session.fetch(url.href, { ...options, headers, credentials: 'omit', redirect: 'error' });
  }
}
