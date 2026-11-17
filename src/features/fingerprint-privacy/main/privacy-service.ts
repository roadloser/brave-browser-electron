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

export class PrivacyService {
  private readonly tokens: FarblingTokenProviderPort;
  private readonly privateModes = new Map<string, { defaultMode?: PrivacyMode; sites: Map<string, PrivacyMode> }>();
  private readonly sessions = new Map<Session, { id: string; contextId: string }>();
  private readonly tabs = new Map<string, TabSnapshot>();
  private readonly stopCore;
  private readonly generation = Date.now();
  private revision = 0;

  constructor(private readonly runtime: FeatureRuntime) {
    this.tokens = new BraveTokenProvider(runtime.storage);
    this.stopCore = runtime.core.onEvent(event => {
      if (event.type === 'sessionCreated') this.attach(event.context);
      if (event.type === 'stateChanged') this.acceptState(event.state);
      if (event.type === 'tabClosed') this.tabs.delete(event.tabId);
      if (event.type === 'contextDisposed' && event.context.isPrivate) {
        this.privateModes.delete(event.context.contextId); this.tokens.release(event.context.contextId);
        for (const [tabId, tab] of this.tabs) if (tab.contextId === event.context.contextId) this.tabs.delete(tabId);
        for (const [session, preload] of this.sessions) if (preload.contextId === event.context.contextId) {
          session.unregisterPreloadScript(preload.id); this.sessions.delete(session);
        }
      }
    });
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
    return this.state(context, tab?.url);
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
    this.stopCore();
    for (const [session, preload] of this.sessions) session.unregisterPreloadScript(preload.id);
    this.sessions.clear(); this.tokens.dispose(); this.privateModes.clear(); this.tabs.clear();
  }

  private state(context: BrowserContext, url?: string): PrivacyState {
    const site = url ? resolvePrivacySite(url) : null;
    const repository = this.repository(context.profileId);
    const privateSettings = context.isPrivate ? this.privateModes.get(context.contextId) : undefined;
    const defaultMode = privateSettings?.defaultMode ?? repository.state().mode;
    const siteMode = site ? context.isPrivate ? privateSettings?.sites.get(site) : repository.siteMode(site) : undefined;
    return {
      mode: siteMode ?? defaultMode, defaultMode, site, inherited: siteMode === undefined,
      runtimeVersion: 'electron43-brave-audio-v1', capabilities: privacyCapabilities(),
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
      this.runtime.publish('privacy.changed', this.state(tab, tab.url), { windowId: tab.windowId });
      this.runtime.core.reload(tab.id);
    }
  }
}
