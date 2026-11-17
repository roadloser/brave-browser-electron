import { FiltersEngine, Request, ENGINE_VERSION } from '@ghostery/adblocker';
import { getDomain } from 'tldts-experimental';
import type { CosmeticInput, CosmeticPlan, EngineCache, FilterDecision, FilterEngineFactoryPort, FilterEnginePort, FilterRequest, RuleBundle, RuleText } from './engine-port';

const ENGINE_ID = 'ghostery';
const VERSION = '2.20.3';
const TYPES = new Set(['mainFrame', 'subFrame', 'stylesheet', 'script', 'image', 'font', 'object', 'xhr', 'ping', 'cspReport', 'media', 'webSocket', 'other']);
type GhosteryRequestType = Parameters<typeof Request.fromRawDetails>[0]['type'];

export class GhosteryAdapter implements FilterEnginePort {
  readonly id = ENGINE_ID;
  readonly version = VERSION;
  readonly capabilities = {
    network: true, csp: true, cosmetics: true, scriptlets: true, procedural: true,
    requestMethod: false, braveRuleParity: false,
  };
  constructor(private readonly engine: FiltersEngine) {}

  match(input: FilterRequest): FilterDecision {
    const result = this.engine.match(this.request(input));
    return {
      action: result.redirect ? 'redirect' : result.match ? 'block' : 'allow',
      redirectUrl: result.redirect?.dataUrl,
      rule: result.filter?.toString(), exception: result.exception?.toString(),
      category: input.type === 'script' ? '脚本' : input.type === 'image' ? '图片' : input.type === 'xhr' ? '跟踪请求' : '广告与跟踪器',
    };
  }

  csp(input: FilterRequest): string | undefined { return this.engine.getCSPDirectives(this.request(input)); }

  cosmetic(input: CosmeticInput): CosmeticPlan {
    const url = new URL(input.url);
    const result = this.engine.getCosmeticsFilters({
      url: input.url, hostname: url.hostname, domain: getDomain(url.hostname, { allowPrivateDomains: true }),
      classes: input.classes, ids: input.ids, hrefs: input.hrefs,
      getBaseRules: input.initial, getInjectionRules: input.initial, getRulesFromHostname: input.initial,
      getExtendedRules: input.aggressive, getRulesFromDOM: !input.initial,
    });
    return {
      active: result.active, styles: result.styles, scripts: result.scripts,
      procedural: input.aggressive ? result.extended.map(rule => ({ providerId: 'ghostery-extended@2.20.3', payload: JSON.stringify(rule) })) : [],
    };
  }

  resources(source: RuleText): void { this.engine.updateResources(source.text, source.sha256); }
  serialize(ruleVersion: string): EngineCache { return { engineId: this.id, engineVersion: this.version, schema: ENGINE_VERSION, ruleVersion, bytes: this.engine.serialize() }; }
  dispose(): void {}

  private request(input: FilterRequest): Request {
    return Request.fromRawDetails({
      requestId: input.id, url: input.url, sourceUrl: input.sourceUrl ?? '', tabId: input.tabId,
      type: (TYPES.has(input.type) ? input.type : 'other') as GhosteryRequestType,
    });
  }
}

export const ghosteryFactory: FilterEngineFactoryPort = {
  id: ENGINE_ID, version: VERSION,
  load(bundle: RuleBundle, cache?: EngineCache): FilterEnginePort {
    if (cache?.engineId === ENGINE_ID && cache.engineVersion === VERSION && cache.schema === ENGINE_VERSION && cache.ruleVersion === bundle.version) {
      try { return new GhosteryAdapter(FiltersEngine.deserialize(cache.bytes)); } catch {}
    }
    const engine = FiltersEngine.parse(bundle.lists.map(list => list.text).join('\n'), {
      debug: true, loadCSPFilters: true, loadCosmeticFilters: true, loadExtendedSelectors: true,
      enableMutationObserver: true, integrityCheck: true,
    });
    const adapter = new GhosteryAdapter(engine);
    adapter.resources(bundle.resources);
    return adapter;
  },
};
