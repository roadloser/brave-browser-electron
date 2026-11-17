import type { CookieMetadata } from '../../../shared/contracts/site-data';
import type { InspectedCookie } from '../../../main/platform/runtime/site-data-inspector';

export function cookieMatchesOrigin(cookie: InspectedCookie, origin: string): boolean {
  const url = new URL(origin);
  if (cookie.secure && url.protocol !== 'https:') return false;
  const domain = cookie.domain.replace(/^\./, '').toLowerCase();
  return cookie.domain.startsWith('.') ? url.hostname === domain || url.hostname.endsWith('.' + domain) : url.hostname === domain;
}
export function cookieMetadata(cookie: InspectedCookie): CookieMetadata {
  return {
    name: cookie.name, domain: cookie.domain, path: cookie.path, hostOnly: !cookie.domain.startsWith('.'),
    secure: cookie.secure, httpOnly: cookie.httpOnly, session: cookie.session,
    expirationDate: !cookie.session && cookie.expires !== undefined && cookie.expires >= 0 ? cookie.expires : undefined,
    sameSite: cookie.sameSite ?? 'Unspecified',
    partitionKey: cookie.partitionKeyOpaque ? 'opaque' : cookie.partitionKey ? cookie.partitionKey.topLevelSite + (cookie.partitionKey.hasCrossSiteAncestor ? ' · 跨站祖先' : ' · 同站祖先') : undefined,
  };
}
export function sourceOrigin(cookie: InspectedCookie): string | undefined {
  if (cookie.domain.startsWith('.')) return undefined;
  if (cookie.sourceScheme !== 'Secure' && cookie.sourceScheme !== 'NonSecure') return undefined;
  const protocol = cookie.sourceScheme === 'Secure' ? 'https:' : 'http:';
  const host = cookie.domain.replace(/^\./, '');
  try {
    const url = new URL(protocol + '//' + host);
    if (cookie.sourcePort && cookie.sourcePort > 0) url.port = String(cookie.sourcePort);
    return url.origin;
  } catch { return undefined; }
}
