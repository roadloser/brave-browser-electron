import type { OnBeforeRequestListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';
import type { BrowserContext, TabSnapshot } from '../../../shared/contracts/browser-core';
import { BrowserError } from '../../../shared/errors';
import { originOf } from './site-scope';

export type ShieldRequestScope = {
  context: BrowserContext;
  policyOrigin: string | null;
  sourceUrl: string | null;
  sourceEvidence: 'navigation-target' | 'parent-frame' | 'request-frame' | 'referrer' | 'unknown';
  tab?: TabSnapshot;
};

export function resolveRequestScope(sessionContext: BrowserContext,
  details: OnBeforeRequestListenerDetails | OnHeadersReceivedListenerDetails, tab?: TabSnapshot): ShieldRequestScope {
  if (tab && (tab.profileId !== sessionContext.profileId || tab.isPrivate !== sessionContext.isPrivate
    || (tab.isPrivate && tab.contextId !== sessionContext.contextId))) {
    throw new BrowserError('FORBIDDEN', '请求资料与Session不一致');
  }
  const context = tab ?? sessionContext;
  let sourceUrl: string | null = null;
  let sourceEvidence: ShieldRequestScope['sourceEvidence'] = 'unknown';
  if (details.resourceType === 'mainFrame') {
    sourceUrl = originOf(details.referrer) ? details.referrer : null;
    sourceEvidence = sourceUrl ? 'referrer' : 'navigation-target';
  } else if (details.resourceType === 'subFrame' && details.frame?.parent && originOf(details.frame.parent.url)) {
    sourceUrl = details.frame.parent.url; sourceEvidence = 'parent-frame';
  } else if (details.resourceType !== 'subFrame' && details.frame && originOf(details.frame.url)) {
    sourceUrl = details.frame.url; sourceEvidence = 'request-frame';
  } else if (originOf(details.referrer)) {
    sourceUrl = details.referrer; sourceEvidence = 'referrer';
  }
  const policyOrigin = details.resourceType === 'mainFrame'
    ? originOf(details.url)
    : tab ? originOf(tab.url) : sourceUrl ? originOf(sourceUrl) : null;
  return { context, policyOrigin, sourceUrl, sourceEvidence, tab };
}
