import type { OnBeforeRequestListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';
import type { BrowserContext, TabSnapshot } from '../../../shared/contracts/browser-core';
import type { ShieldsPolicy } from '../../../shared/contracts/shields';
import { BrowserError } from '../../../shared/errors';
import type { FilterEnginePort } from './engine-port';
import { appendCsp, mapRequest } from './request-adapter';
import { resolveRequestScope } from './request-scope';
import { sameSite } from './site-scope';
import { DEFAULT_SHIELDS_POLICY } from './site-rules-repository';

type Dependencies = {
  tabForContents: (contentsId: number) => TabSnapshot | undefined;
  policy: (context: BrowserContext, origin: string) => ShieldsPolicy;
  readyEngine: (profileId: string) => Promise<FilterEnginePort | null>;
  engine: (profileId: string) => FilterEnginePort | null;
  record: (tab: TabSnapshot | undefined, category: string) => void;
  disposed: () => boolean;
  issue: (tab: TabSnapshot | undefined, issue: 'missing-policy' | 'missing-source' | 'referrer-fallback') => void;
};

export class ShieldRequestController {
  constructor(private readonly dependencies: Dependencies) {}

  async evaluate(context: BrowserContext, details: OnBeforeRequestListenerDetails) {
    const scope = resolveRequestScope(context, details, this.dependencies.tabForContents(details.webContentsId));
    if (scope.sourceEvidence === 'referrer') this.dependencies.issue(scope.tab, 'referrer-fallback');
    const request = mapRequest(details, scope.sourceUrl);
    const policy = scope.policyOrigin ? this.dependencies.policy(scope.context, scope.policyOrigin) : DEFAULT_SHIELDS_POLICY;
    if (!policy.enabled) return {};
    if (policy.httpsUpgrade && scope.policyOrigin && request.url.startsWith('http:')) {
      const url = new URL(request.url);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.hostname.endsWith('.localhost')) {
        url.protocol = 'https:'; return { redirectURL: url.href };
      }
    }
    if (policy.blockScripts && scope.policyOrigin && request.type === 'script') {
      this.dependencies.record(scope.tab, '脚本'); return { cancel: true };
    }
    if (!scope.policyOrigin || (!scope.sourceUrl && request.type !== 'mainFrame')) {
      this.dependencies.issue(scope.tab, !scope.policyOrigin ? 'missing-policy' : 'missing-source');
      return {};
    }
    const engine = await this.dependencies.readyEngine(scope.context.profileId);
    if (this.dependencies.disposed()) return { cancel: true };
    if (!engine) throw new BrowserError('UNAVAILABLE', 'Shields规则未就绪；请更新规则或明确关闭此站点的Shields');
    if (request.type === 'mainFrame' && !/^wss?:/.test(request.url)) return {};
    if (policy.blocking === 'standard' && scope.sourceUrl && sameSite(request.url, scope.sourceUrl)) return {};
    const decision = engine.match(request);
    if (decision.action !== 'allow') this.dependencies.record(scope.tab, decision.category);
    return decision.action === 'redirect' ? { redirectURL: decision.redirectUrl } : { cancel: decision.action === 'block' };
  }

  responseHeaders(context: BrowserContext, details: OnHeadersReceivedListenerDetails) {
    const headers = details.responseHeaders ?? {};
    if (!['mainFrame', 'subFrame'].includes(details.resourceType)) return headers;
    const scope = resolveRequestScope(context, details, this.dependencies.tabForContents(details.webContentsId));
    if (!scope.policyOrigin) return headers;
    const policy = this.dependencies.policy(scope.context, scope.policyOrigin);
    if (!policy.enabled) return headers;
    const source = details.resourceType === 'mainFrame' ? details.url : scope.sourceUrl;
    const directives = policy.blockScripts ? ["script-src 'none'"] : [];
    if (source) {
      const csp = this.dependencies.engine(scope.context.profileId)?.csp(mapRequest(details, source));
      if (csp) directives.push(csp);
    }
    return appendCsp(headers, directives);
  }
}
