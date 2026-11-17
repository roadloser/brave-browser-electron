import { BrowserError } from '../../shared/errors';

const internalPages = new Set(['newtab', 'bookmarks', 'history', 'downloads', 'settings', 'extensions', 'credentials', 'sync', 'site-data', 'vpn']);
const marker = 'about:blank#brave-electron:';

export function isInternalPage(url: string): boolean {
  try { return new URL(url).protocol === 'brave:' && internalPages.has(new URL(url).hostname); } catch { return false; }
}

export function nativeUrl(url: string): string {
  return isInternalPage(url) ? marker + encodeURIComponent(url) : url;
}

export function logicalUrl(url: string): string {
  if (!url.startsWith(marker)) return url;
  try {
    const candidate = decodeURIComponent(url.slice(marker.length));
    return isInternalPage(candidate) ? candidate : 'about:blank';
  } catch { return 'about:blank'; }
}

export function normalizeNavigation(input: string, searchEngine = 'brave'): string {
  const trimmed = input.trim();
  if (!trimmed) return 'brave://newtab';
  if (isInternalPage(trimmed)) return trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    const parsed = new URL(trimmed);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href;
    if (trimmed === 'about:blank') return trimmed;
    throw new BrowserError('FORBIDDEN', '此地址协议不能在网页标签中打开');
  }
  if (/^(localhost|\[[\da-f:]+\]|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:[/?#]|$)/i.test(trimmed)) {
    return new URL((trimmed.startsWith('localhost') ? 'http://' : 'https://') + trimmed).href;
  }
  const engines: Record<string, string> = { brave: 'https://search.brave.com/search?q=', google: 'https://www.google.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=', bing: 'https://www.bing.com/search?q=' };
  return (engines[searchEngine] ?? engines.brave) + encodeURIComponent(trimmed);
}
