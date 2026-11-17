import { BrowserWindow } from 'electron';
import type { Session } from 'electron';
import type { BrowserContext, BrowserSnapshot, TabSnapshot } from '../../../shared/contracts/browser-core';
import type { PrivacyMode, PrivacyState } from '../../../shared/contracts/fingerprint-privacy';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { PrivacyRepository } from './privacy-repository';
import { BraveTokenProvider, type FarblingTokenProviderPort } from './token-provider';
import { resolvePrivacySite } from './site-scope-resolver';
import { privacyCapabilities } from './capability-registry';
import type { FramePrivacyPolicy } from '../runtime/protocol';
import { CdpPrivacyContextAdapter } from '../runtime/cdp-context-adapter';
import type { ExecutionContextKind } from '../../../shared/contracts/fingerprint-privacy';

export class PrivacyService {
  private readonly tokens: FarblingTokenProviderPort;
  private readonly privateModes = new Map<string, { defaultMode?: PrivacyMode; sites: Map<string, PrivacyMode> }>();
  private readonly sessions = new Map<Session, { id: string; contextId: string }>();
  private readonly tabs = new Map<string, TabSnapshot>();
  private readonly stopCore;
  private readonly stopPreparation;
  private readonly cdpContexts = new Map<string, CdpPrivacyContextAdapter>();
  private readonly cdpOutcomes = new Map<string, Map<ExecutionContextKind, { applied: boolean; reason: string }>>();
  private readonly generation = Date.now();
  private revision = 0;

  constructor(private readonly runtime: FeatureRuntime) {
    this.tokens = new BraveTokenProvider(runtime.storage);
    this.stopCore = runtime.core.onEvent(event => {
      if (event.type === 'sessionCreated') this.attach(event.context);
      if (event.type === 'stateChanged') this.acceptState(event.state);
      if (event.type === 'tabClosed') {
        this.tabs.delete(event.tabId);
        this.cdpContexts.get(event.tabId)?.dispose(); this.cdpContexts.delete(event.tabId); this.cdpOutcomes.delete(event.tabId);
      }
      if (event.type === 'contextDisposed' && event.context.isPrivate) {
        this.privateModes.delete(event.context.contextId); this.tokens.release(event.context.contextId);
        for (const [tabId, tab] of this.tabs) if (tab.contextId === event.context.contextId) this.tabs.delete(tabId);
        for (const [session, preload] of this.sessions) if (preload.contextId === event.context.contextId) {
          session.unregisterPreloadScript(preload.id); this.sessions.delete(session);
        }
      }
    });
    this.stopPreparation = runtime.core.registerBeforeNavigate('fingerprint-context', tab => this.prepareContext(tab));
  }

  start(): void {
    for (const nativeWindow of BrowserWindow.getAllWindows()) {
      const window = this.runtime.core.getWindowForSender(nativeWindow.webContents.id);
      if (window) { this.acceptState(this.runtime.core.getState(window.id)); break; }
    }
    for (const context of this.runtime.core.getContexts()) this.attach(context);
  }

  get(context: CommandContext, tabId?: string): PrivacyState {
    const tab = tabId ? this.runtime.core.getTab(tabId) : undefined;
    if (tab && (tab.windowId !== context.windowId || tab.contextId !== context.contextId)) throw new BrowserError('FORBIDDEN', '不能读取其他窗口的隐私策略');
    return this.state(context, tab?.url, tab?.id);
  }

  setDefault(context: CommandContext, mode: PrivacyMode): PrivacyState {
    if (context.isPrivate) this.privateState(context.contextId).defaultMode = mode;
    else this.repository(context.profileId).setDefault(mode);
    this.changed(context);
    return this.state(context);
  }

  setSite(context: CommandContext, origin: string, mode: PrivacyMode | null): PrivacyState {
    const site = resolvePrivacySite(origin);
    if (!site) throw new BrowserError('INVALID_ARGUMENT', '指纹策略仅支持http(s)站点');
    if (context.isPrivate) {
      const settings = this.privateState(context.contextId);
      if (mode === null) settings.sites.delete(site); else settings.sites.set(site, mode);
    } else this.repository(context.profileId).setSite(site, mode);
    this.changed(context, site);
    return this.state(context, origin);
  }

  framePolicy(contentsId: number, url: string): FramePrivacyPolicy {
    const tab = this.tabForContents(contentsId);
    const site = resolvePrivacySite(url);
    if (!tab || !site) return { mode: 'off', token: null, scope: null };
    const mode = this.effectiveMode(tab, site);
    if (mode === 'off') return { mode, token: null, scope: site };
    const token = this.tokens.forSite(tab, site);
    return { mode, token: { high: token.high, low: token.low }, scope: site };
  }

  tabForContents(contentsId: number): TabSnapshot | undefined {
    for (const tab of this.tabs.values()) {
      try { if (this.runtime.core.getTabWebContents(tab.id).id === contentsId) return tab; } catch {}
    }
    return undefined;
  }

  dispose(): void {
    this.stopCore(); this.stopPreparation();
    for (const adapter of this.cdpContexts.values()) adapter.dispose();
    this.cdpContexts.clear(); this.cdpOutcomes.clear();
    for (const [session, preload] of this.sessions) session.unregisterPreloadScript(preload.id);
    this.sessions.clear(); this.tokens.dispose(); this.privateModes.clear(); this.tabs.clear();
  }

  private state(context: BrowserContext, url?: string, tabId?: string): PrivacyState {
    const site = url ? resolvePrivacySite(url) : null;
    const repository = this.repository(context.profileId);
    const privateSettings = context.isPrivate ? this.privateModes.get(context.contextId) : undefined;
    const defaultMode = privateSettings?.defaultMode ?? repository.state().mode;
    const siteMode = site ? context.isPrivate ? privateSettings?.sites.get(site) : repository.siteMode(site) : undefined;
    return {
      mode: siteMode ?? defaultMode, defaultMode, site, inherited: siteMode === undefined,
      runtimeVersion: 'electron43-chromium150-brave-audio-v2', capabilities: privacyCapabilities().map(capability => {
        const outcome = tabId ? this.cdpOutcomes.get(tabId)?.get(capability.context) : undefined;
        if (capability.api !== 'audio' || !outcome) return capability;
        return { ...capability, status: outcome.applied ? 'partial' : 'blocked', implemented: outcome.applied, observed: false, reason: outcome.reason };
      }),
      scope: site ? { profileId: context.profileId, contextId: context.contextId, site, generation: this.generation } : null,
      revision: this.revision + repository.state().revision,
    };
  }
  private effectiveMode(context: BrowserContext, site: string): PrivacyMode {
    const repository = this.repository(context.profileId);
    const settings = context.isPrivate ? this.privateModes.get(context.contextId) : undefined;
    return context.isPrivate
      ? settings?.sites.get(site) ?? settings?.defaultMode ?? repository.state().mode
      : repository.siteMode(site) ?? repository.state().mode;
  }
  private repository(profileId: string) { return new PrivacyRepository(this.runtime.storage.open(profileId)); }
  private privateState(contextId: string) {
    const settings = this.privateModes.get(contextId) ?? { sites: new Map<string, PrivacyMode>() };
    this.privateModes.set(contextId, settings);
    return settings;
  }
  private attach(context: BrowserContext): void {
    const session = this.runtime.core.sessionForContext(context);
    if (this.sessions.has(session)) return;
    const id = session.registerPreloadScript({ type: 'frame', filePath: this.runtime.assets.privacyPreloadPath });
    this.sessions.set(session, { id, contextId: context.contextId });
  }
  private acceptState(state: BrowserSnapshot): void {
    const windowIds = new Set(state.windows.map(window => window.id));
    for (const [tabId, tab] of this.tabs) if (windowIds.has(tab.windowId)) this.tabs.delete(tabId);
    for (const window of state.windows) for (const tab of window.tabs) this.tabs.set(tab.id, tab);
  }
  private changed(context: CommandContext, site?: string): void {
    this.revision++;
    for (const tab of this.tabs.values()) {
      if (tab.profileId !== context.profileId || (context.isPrivate && tab.contextId !== context.contextId)) continue;
      if (site && resolvePrivacySite(tab.url) !== site) continue;
      this.runtime.publish('privacy.changed', this.state(tab, tab.url, tab.id), { windowId: tab.windowId });
      if (this.cdpContexts.has(tab.id) && this.effectiveMode(tab, resolvePrivacySite(tab.url) ?? '') === 'off') {
        this.cdpContexts.get(tab.id)?.dispose(); this.cdpContexts.delete(tab.id);
      } else if (!this.cdpContexts.has(tab.id)) void this.prepareContext(tab);
      this.runtime.core.reload(tab.id);
    }
  }

  private async prepareContext(tab: TabSnapshot): Promise<void> {
    const site = resolvePrivacySite(tab.url);
    if (!site || this.effectiveMode(tab, site) === 'off') return;
    if (this.cdpContexts.has(tab.id)) return;
    const adapter = new CdpPrivacyContextAdapter(tab, this.runtime.debugger, scope => {
      const sourceSite = resolvePrivacySite(scope.origin);
      if (!sourceSite || scope.nonce) return { mode: 'off', token: null, scope: sourceSite };
      const mode = this.effectiveMode(tab, sourceSite);
      if (mode === 'off') return { mode, token: null, scope: sourceSite };
      const token = this.tokens.forSite(tab, sourceSite);
      return { mode, token: { high: token.high, low: token.low }, scope: sourceSite };
    }, outcome => {
      const outcomes = this.cdpOutcomes.get(tab.id) ?? new Map();
      outcomes.set(outcome.context, outcome); this.cdpOutcomes.set(tab.id, outcomes);
      this.revision++;
      this.runtime.publish('privacy.changed', this.state(tab, tab.url, tab.id), { windowId: tab.windowId });
    });
    try { await adapter.start(); this.cdpContexts.set(tab.id, adapter); }
    catch (error) {
      adapter.dispose();
      const outcomes = this.cdpOutcomes.get(tab.id) ?? new Map();
      outcomes.set('iframe', { applied: false, reason: error instanceof Error ? error.message : 'CDP准备失败' });
      this.cdpOutcomes.set(tab.id, outcomes);
      this.runtime.publish('privacy.changed', this.state(tab, tab.url, tab.id), { windowId: tab.windowId });
    }
  }
}
