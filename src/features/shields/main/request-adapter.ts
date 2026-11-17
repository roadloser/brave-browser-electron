import type { OnBeforeRequestListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';
import type { FilterRequest } from './engine-port';

type ElectronDetails = OnBeforeRequestListenerDetails | OnHeadersReceivedListenerDetails;

export function mapRequest(details: ElectronDetails, sourceUrl: string | null): FilterRequest {
  return { id: String(details.id), url: details.url, sourceUrl, type: details.resourceType, method: details.method, tabId: details.webContentsId };
}

export function appendCsp(headers: Record<string, string | string[]>, directives: string[]): Record<string, string | string[]> {
  if (!directives.length) return headers;
  const result = { ...headers };
  const key = Object.keys(result).find(name => name.toLowerCase() === 'content-security-policy') ?? 'Content-Security-Policy';
  const existing = result[key];
  result[key] = [...(typeof existing === 'string' ? [existing] : existing ?? []), ...directives];
  return result;
}
