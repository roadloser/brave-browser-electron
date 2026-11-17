import { BrowserWindow } from 'electron';
import type { OnBeforeRequestListenerDetails, OnHeadersReceivedListenerDetails, Session } from 'electron';
import type { BrowserContext, BrowserSnapshot, TabSnapshot } from '../../../shared/contracts/browser-core';
import type { ShieldsPolicy, ShieldsState } from '../../../shared/contracts/shields';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { FilterEngine } from './filter-engine';
import { SiteRulesRepository, DEFAULT_SHIELDS_POLICY } from './site-rules-repository';
import { RuleUpdater } from './rule-updater';
import { DecisionRecorder } from './decision-recorder';
import { appendCsp, mapRequest } from './request-adapter';
import { originOf, sameSite } from './site-scope';
import type { CosmeticInput, CosmeticPlan } from './engine-port';

type ProfileState = { repository: SiteRulesRepository; engine: FilterEngine; updater: RuleUpdater; loading: Promise<void> | null };

export class ShieldsService {
  private readonly profiles = new Map<string, ProfileState>();
  private readonly sessions = new Map<Session, { release: () => void; contextId: string }>();
  private readonly tabs = new Map<string, TabSnapshot>();
  private readonly privatePolicies = new Map<string, Map<string, ShieldsPolicy>>();
  private readonly decisions = new DecisionRecorder();
  private readonly stopCore;
  private revision = 0;
  private disposed = false;

  constructor(private readonly runtime: FeatureRuntime) {
    this.stopCore = runtime.core.onEvent(event => {
      if (event.type === 'sessionCreated') this.attach(event.context);
      if (event.type === 'stateChanged') this.acceptState(event.state);
      if (event.type === 'navigationCommitted') {
        this.decisions.reset(event.visit.tabId, event.visit.navigationId);
        this.publishTab(event.visit.tabId);
      }
      if (event.type === 'tabClosed') { this.tabs.delete(event.tabId); this.decisions.remove(event.tabId); }
      if (event.type === 'contextDisposed') {
        this.privatePolicies.delete(event.context.contextId);
        if (event.context.isPrivate) for (const [session, attached] of this.sessions) {
          if (attached.contextId === event.context.contextId) { attached.release(); this.sessions.delete(session); }
        }
      }
    });
  }

  start(): void {
    for (const nativeWindow of BrowserWindow.getAllWindows()) {
      const window = this.runtime.core.getWindowForSender(nativeWindow.webContents.id);
      if (window) { this.acceptState(this.runtime.core.getState(window.id)); break; }
    }
    for (const profile of this.runtime.core.getProfiles()) this.profile(profile.id);
    for (const context of this.runtime.core.getContexts()) this.attach(context);
  }

  state(context: CommandContext, tabId: string): ShieldsState { return this.tabState(this.ownedTab(context, tabId)); }

  setPolicy(context: CommandContext, origin: string, policy?: ShieldsPolicy): ShieldsState[] {
    if (context.isPrivate) {
      const policies = this.privatePolicies.get(context.contextId) ?? new Map<string, ShieldsPolicy>();
      if (policy) policies.set(origin, policy); else policies.delete(origin);
      this.privatePolicies.set(context.contextId, policies);
    } else this.profile(context.profileId).repository.setPolicy(origin, policy);
    const affected = [...this.tabs.values()].filter(tab => tab.profileId === context.profileId
      && (context.isPrivate ? tab.contextId === context.contextId : !tab.isPrivate) && originOf(tab.url) === origin);
    this.revision++;
    for (const tab of affected) {
      this.publishTab(tab.id);
      this.runtime.core.reload(tab.id);
    }
    return affected.map(tab => this.tabState(tab));
  }

  rules(context: CommandContext) { return this.profile(context.profileId).updater.state(); }
  async updateRules(context: CommandContext) {
    this.regular(context);
    const profile = this.profile(context.profileId);
    const operation = profile.updater.update();
    profile.loading = operation.then(() => undefined, () => undefined);
    const result = await operation;
    for (const tab of this.tabs.values()) if (tab.profileId === context.profileId) this.runtime.core.reload(tab.id);
    return result;
  }
  cancelUpdate(context: CommandContext) { this.regular(context); return this.profile(context.profileId).updater.cancel(); }
  rollbackRules(context: CommandContext) {
    this.regular(context);
    const result = this.profile(context.profileId).updater.rollback();
    for (const tab of this.tabs.values()) if (tab.profileId === context.profileId) this.runtime.core.reload(tab.id);
    return result;
  }

  cosmetic(contentsId: number, frameUrl: string, input: Omit<CosmeticInput, 'url' | 'aggressive'>): CosmeticPlan {
    const tab = this.tabForContents(contentsId);
    if (!tab) return { active: false, styles: '', scripts: [], procedural: [] };
    const origin = originOf(frameUrl);
    if (!origin) return { active: false, styles: '', scripts: [], procedural: [] };
    const policy = this.policy(tab, origin);
    const engine = this.profile(tab.profileId).engine.active;
    if (!policy.enabled || !engine) return { active: false, styles: '', scripts: [], procedural: [] };
    const plan = engine.cosmetic({ ...input, url: frameUrl, aggressive: policy.blocking === 'aggressive' });
    return { ...plan, scripts: policy.blockScripts ? [] : plan.scripts };
  }

  tabForContents(contentsId: number): TabSnapshot | undefined {
    for (const tab of this.tabs.values()) {
      try { if (this.runtime.core.getTabWebContents(tab.id).id === contentsId) return tab; } catch {}
    }
    return undefined;
  }

  dispose(): void {
    this.disposed = true; this.stopCore();
    for (const session of this.sessions.values()) session.release();
    this.sessions.clear();
    for (const profile of this.profiles.values()) { profile.updater.dispose(); profile.engine.dispose(); }
    this.profiles.clear(); this.tabs.clear(); this.privatePolicies.clear(); this.decisions.dispose();
  }

  private profile(profileId: string): ProfileState {
    const existing = this.profiles.get(profileId);
    if (existing) return existing;
    const repository = new SiteRulesRepository(this.runtime.storage.open(profileId));
    const engine = new FilterEngine();
    const updater = new RuleUpdater(repository, engine, () => {
      if (this.disposed) return;
      this.revision++;
      this.runtime.publish('shields.rulesChanged', updater.state(), { profileId, includePrivate: true });
      for (const tab of this.tabs.values()) if (tab.profileId === profileId) this.publishTab(tab.id);
    });
    const state: ProfileState = { repository, engine, updater, loading: null };
    this.profiles.set(profileId, state);
    updater.restore();
    if (!engine.active) state.loading = updater.update().then(() => undefined, () => undefined);
    return state;
  }

  private attach(context: BrowserContext): void {
    const session = this.runtime.core.sessionForContext(context);
    if (this.sessions.has(session)) return;
    this.profile(context.profileId);
    const releaseRequest = this.runtime.requests.attach(session, details => this.evaluate(context, details), error => {
      this.runtime.publish('app.error', { code: 'UNAVAILABLE', message: error instanceof Error ? error.message : 'Shields 请求处理失败', recoverable: true }, { contextId: context.contextId });
    });
    const releaseHeaders = this.runtime.requests.attachResponseHeaders(session, details => this.responseHeaders(context, details));
    const preloadId = session.registerPreloadScript({ type: 'frame', filePath: this.runtime.assets.shieldsPreloadPath });
    this.sessions.set(session, { contextId: context.contextId, release: () => {
      session.unregisterPreloadScript(preloadId); releaseHeaders(); releaseRequest();
    } });
  }

  private async evaluate(context: BrowserContext, details: OnBeforeRequestListenerDetails) {
    const request = mapRequest(details);
    const tab = this.tabForContents(details.webContentsId);
    const policyOrigin = request.type === 'mainFrame' ? originOf(request.url) : request.sourceUrl ? originOf(request.sourceUrl) : null;
    const policy = policyOrigin ? this.policy(context, policyOrigin) : DEFAULT_SHIELDS_POLICY;
    if (!policy.enabled) return {};
    if (policy.httpsUpgrade && request.url.startsWith('http:')) {
      const url = new URL(request.url);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.hostname.endsWith('.localhost')) {
        url.protocol = 'https:';
        return { redirectURL: url.href };
      }
    }
    if (policy.blockScripts && request.type === 'script') { this.record(tab, '脚本'); return { cancel: true }; }
    const profile = this.profile(context.profileId);
    if (!profile.engine.active && profile.loading) await profile.loading;
    if (this.disposed) return { cancel: true };
    const engine = profile.engine.active;
    if (!engine) throw new BrowserError('UNAVAILABLE', 'Shields 规则未就绪，已阻止此次请求；请重试更新规则或明确关闭此站点的 Shields');
    if (request.type === 'mainFrame') return {};
    if (policy.blocking === 'standard' && request.sourceUrl && sameSite(request.url, request.sourceUrl)) return {};
    const decision = engine.match(request);
    if (decision.action !== 'allow') this.record(tab, decision.category);
    return decision.action === 'redirect' ? { redirectURL: decision.redirectUrl } : { cancel: decision.action === 'block' };
  }

  private responseHeaders(context: BrowserContext, details: OnHeadersReceivedListenerDetails) {
    const original = details.responseHeaders ?? {};
    if (!['mainFrame', 'subFrame'].includes(details.resourceType)) return original;
    const request = mapRequest(details);
    const origin = originOf(details.url);
    const policy = origin ? this.policy(context, origin) : DEFAULT_SHIELDS_POLICY;
    if (!policy.enabled) return original;
    const directives: string[] = [];
    if (policy.blockScripts) directives.push("script-src 'none'");
    const csp = this.profile(context.profileId).engine.active?.csp(request);
    if (csp) directives.push(csp);
    return appendCsp(original, directives);
  }

  private policy(context: BrowserContext, origin: string): ShieldsPolicy {
    return context.isPrivate
      ? this.privatePolicies.get(context.contextId)?.get(origin) ?? this.profile(context.profileId).repository.policy(origin)
      : this.profile(context.profileId).repository.policy(origin);
  }
  private acceptState(state: BrowserSnapshot) {
    this.tabs.clear();
    for (const window of state.windows) for (const tab of window.tabs) this.tabs.set(tab.id, tab);
  }
  private ownedTab(context: CommandContext, tabId: string) {
    const tab = this.runtime.core.getTab(tabId);
    if (tab.windowId !== context.windowId || tab.contextId !== context.contextId) throw new BrowserError('FORBIDDEN', '不能查询其他窗口的Shields状态');
    return tab;
  }
  private tabState(tab: TabSnapshot): ShieldsState {
    const profile = this.profile(tab.profileId);
    const rules = profile.updater.state();
    const engine = profile.engine.active;
    const origin = originOf(tab.url) ?? '';
    return {
      tabId: tab.id, origin, policy: this.policy(tab, origin), ...this.decisions.get(tab.id), ruleVersion: rules.version,
      engine: { name: engine ? `${engine.id} ${engine.version}` : null, status: engine ? 'ready' : rules.status === 'updating' ? 'loading' : rules.status === 'failed' ? 'failed' : 'unconfigured', error: rules.error },
      revision: this.revision,
    };
  }
  private publishTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) this.runtime.publish('shields.changed', this.tabState(tab), { windowId: tab.windowId });
  }
  private record(tab: TabSnapshot | undefined, category: string): void {
    if (!tab) return;
    this.decisions.record(tab.id, tab.navigationId, category); this.revision++; this.publishTab(tab.id);
  }
  private regular(context: BrowserContext): void {
    if (context.isPrivate) throw new BrowserError('FORBIDDEN', '请在普通窗口更新资料规则');
  }
}
