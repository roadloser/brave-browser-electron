import type { OnBeforeRequestListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';
import type { FilterRequest } from './engine-port';
import { originOf } from './site-scope';

type ElectronDetails = OnBeforeRequestListenerDetails | OnHeadersReceivedListenerDetails;

export function mapRequest(details: ElectronDetails): FilterRequest {
  const frameUrl = details.frame?.url;
  const source = frameUrl && originOf(frameUrl) ? frameUrl : details.referrer && originOf(details.referrer) ? details.referrer : null;
  return { id: String(details.id), url: details.url, sourceUrl: source, type: details.resourceType, method: details.method, tabId: details.webContentsId };
}

export function appendCsp(headers: Record<string, string | string[]>, directives: string[]): Record<string, string | string[]> {
  if (!directives.length) return headers;
  const result = { ...headers };
  const key = Object.keys(result).find(name => name.toLowerCase() === 'content-security-policy') ?? 'Content-Security-Policy';
  const existing = result[key];
  result[key] = [...(typeof existing === 'string' ? [existing] : existing ?? []), ...directives];
  return result;
}
