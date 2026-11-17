import { getDomain } from 'tldts-experimental';

export function resolvePrivacySite(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const domain = getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname;
    return `${url.protocol}//${domain}`;
  } catch { return null; }
}
