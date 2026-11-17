import { getDomain } from 'tldts-experimental';

export function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) ? url.origin : null;
  } catch { return null; }
}

export function sameSite(left: string, right: string): boolean {
  try {
    const leftHost = new URL(left).hostname;
    const rightHost = new URL(right).hostname;
    return (getDomain(leftHost, { allowPrivateDomains: true }) ?? leftHost) === (getDomain(rightHost, { allowPrivateDomains: true }) ?? rightHost);
  } catch { return false; }
}
