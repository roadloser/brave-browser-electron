import { BrowserWindow, systemPreferences, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { PermissionPrompt, SitePermission, SiteSettingsState } from '../../../shared/contracts/site-settings';
import { sitePermissionSchema } from '../../../shared/contracts/site-settings';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { SitePolicyRepository } from './site-policy-repository';

type PendingPermission = { prompt: PermissionPrompt; context: BrowserContext; settle: (allow: boolean) => void; timer: ReturnType<typeof setTimeout> };
function originOf(value: string): string | undefined {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.origin : undefined; } catch { return undefined; }
}
function permissionKinds(permission: string, mediaTypes?: string[]): SitePermission[] {
  if (permission === 'media') return (mediaTypes ?? []).flatMap(type => type === 'video' ? ['camera'] : type === 'audio' ? ['microphone'] : []) as SitePermission[];
  const parsed = sitePermissionSchema.safeParse(permission);
  return parsed.success ? [parsed.data] : [];
}
export class PermissionService {
  private readonly repository: SitePolicyRepository;
  private readonly pending = new Map<string, PendingPermission>();
  private readonly sessions = new Map<string, () => void>();
  private revision = 0;
  private readonly disposeCore: () => void;

  constructor(private readonly runtime: FeatureRuntime) {
    this.repository = new SitePolicyRepository(runtime.storage);
    this.disposeCore = runtime.core.onEvent(event => {
      if (event.type === 'sessionCreated') this.attach(event.context);
      if (event.type === 'contextDisposed') this.release(event.context);
      if (event.type === 'tabClosed') this.cancelTab(event.tabId);
      if (event.type === 'navigationCommitted') this.cancelTab(event.visit.tabId);
    });
    for (const context of runtime.core.getContexts()) this.attach(context);
  }

  get(context: BrowserContext, origin?: string): SiteSettingsState {
    return {
      rules: this.repository.list(context).filter(rule => !origin || rule.origin === origin),
      prompts: [...this.pending.values()].filter(entry => entry.context.contextId === context.contextId && (!origin || entry.prompt.origin === origin)).map(entry => entry.prompt),
      revision: this.revision,
    };
  }
  set(context: BrowserContext, origin: string, permission: SitePermission, decision: 'allow' | 'deny' | 'ask') {
    this.repository.set(context, origin, permission, decision);
    this.publish(context);
    return this.get(context);
  }
  resetOrigin(context: BrowserContext, origin: string): void {
    this.repository.reset(context, origin);
    for (const [id, entry] of this.pending) if (entry.context.contextId === context.contextId && entry.prompt.origin === origin) this.finish(id, false);
    this.publish(context);
  }

  async resolve(context: CommandContext, id: string, allow: boolean, remember: boolean): Promise<SiteSettingsState> {
    const entry = this.pending.get(id);
    if (!entry || entry.context.contextId !== context.contextId) throw new BrowserError('NOT_FOUND', '此权限请求已结束');
    const tab = this.runtime.core.getTab(entry.prompt.tabId);
    if (tab.windowId !== context.windowId || originOf(tab.url) !== entry.prompt.topLevelOrigin) throw new BrowserError('FORBIDDEN', '权限请求的页面已变化');
    if (allow && process.platform === 'darwin' && ['camera', 'microphone'].includes(entry.prompt.permission)) {
      const media = entry.prompt.permission as 'camera' | 'microphone';
      const status = systemPreferences.getMediaAccessStatus(media);
      if (status === 'denied' || status === 'restricted' || (status === 'not-determined' && !await systemPreferences.askForMediaAccess(media))) {
        this.finish(id, false);
        throw new BrowserError('UNAVAILABLE', '系统未授予此媒体权限，请在系统设置中允许后重试');
      }
    }
    if (remember) this.repository.set(context, entry.prompt.origin, entry.prompt.permission, allow ? 'allow' : 'deny');
    this.finish(id, allow);
    this.publish(context);
    return this.get(context);
  }

  async clearData(context: CommandContext, input: { origin?: string; cookies: boolean; cache: boolean; localStorage: boolean }) {
    if (input.origin && input.cookies) throw new BrowserError('INVALID_ARGUMENT', 'Cookie 存在共享域与分区范围，请从网站数据页面确认后清理');
    const browserSession = this.runtime.core.sessionForContext(context);
    const dataTypes: Array<'cookies' | 'localStorage' | 'indexedDB' | 'serviceWorkers' | 'fileSystems' | 'backgroundFetch' | 'cache'> = [];
    if (input.cookies) dataTypes.push('cookies');
    if (input.localStorage) dataTypes.push('localStorage', 'indexedDB', 'serviceWorkers', 'fileSystems', 'backgroundFetch');
    if (input.cache) dataTypes.push('cache');
    if (dataTypes.length) await browserSession.clearData({ origins: input.origin ? [input.origin] : undefined, originMatchingMode: 'origin-in-all-contexts', dataTypes });
    return { cleared: true };
  }

  dispose(): void {
    this.disposeCore();
    for (const id of [...this.pending.keys()]) this.finish(id, false);
    for (const dispose of this.sessions.values()) dispose();
    this.sessions.clear();
  }

  private attach(context: BrowserContext): void {
    if (this.sessions.has(context.contextId)) return;
    const browserSession = this.runtime.core.sessionForContext(context);
    browserSession.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
      const origin = originOf(requestingOrigin || details.requestingUrl || '');
      const permissions = permissionKinds(permission, details.mediaType ? [details.mediaType] : []);
      return !!origin && permissions.length > 0 && permissions.every(kind => this.decision(context, origin, kind) === 'allow');
    });
    browserSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      const origin = originOf(details.requestingUrl || '');
      const tab = this.findTab(context, contents);
      const permissions = permissionKinds(permission, 'mediaTypes' in details ? details.mediaTypes : []);
      if (!origin || !tab || !permissions.length) { callback(false); return; }
      let remaining = permissions.length;
      let granted = true;
      const settle = (allowed: boolean) => { granted = granted && allowed; remaining -= 1; if (!remaining) callback(granted); };
      for (const kind of permissions) {
        const decision = this.decision(context, origin, kind);
        if (decision) { settle(decision === 'allow'); continue; }
        const id = randomUUID();
        const prompt: PermissionPrompt = { id, tabId: tab.id, origin, topLevelOrigin: originOf(tab.url) ?? '', permission: kind, requestedAt: Date.now() };
        const timer = setTimeout(() => { this.finish(id, false); this.publish(context); }, 60000);
        this.pending.set(id, { prompt, context, settle, timer });
      }
      this.publish(context);
    });
    this.sessions.set(context.contextId, () => {
      browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      browserSession.setPermissionCheckHandler(() => false);
    });
  }

  private findTab(context: BrowserContext, contents: WebContents) {
    const window = this.runtime.core.getContexts().find(candidate => candidate.contextId === context.contextId);
    if (!window) return undefined;
    for (const pendingWindow of this.knownWindows(context)) {
      const match = pendingWindow.tabs.find(tab => this.runtime.core.getTabWebContents(tab.id).id === contents.id);
      if (match) return match;
    }
    return undefined;
  }
  private knownWindows(context: BrowserContext) {
    const windows = new Map<string, ReturnType<FeatureRuntime['core']['getWindow']>>();
    for (const nativeWindow of BrowserWindow.getAllWindows()) {
      const mapped = this.runtime.core.getWindowForSender(nativeWindow.webContents.id);
      if (mapped?.contextId === context.contextId) windows.set(mapped.id, mapped);
    }
    return [...windows.values()];
  }
  private decision(context: BrowserContext, origin: string, permission: SitePermission) {
    return this.repository.list(context).find(rule => rule.origin === origin && rule.permission === permission)?.decision;
  }
  private finish(id: string, allow: boolean): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id); clearTimeout(entry.timer); entry.settle(allow);
  }
  private cancelTab(tabId: string): void {
    for (const [id, entry] of this.pending) if (entry.prompt.tabId === tabId) { this.finish(id, false); this.publish(entry.context); }
  }
  private publish(context: BrowserContext): void {
    this.revision += 1; this.runtime.publish('siteSettings.changed', this.get(context), { contextId: context.contextId });
  }
  private release(context: BrowserContext): void {
    for (const [id, entry] of this.pending) if (entry.context.contextId === context.contextId) this.finish(id, false);
    this.sessions.get(context.contextId)?.(); this.sessions.delete(context.contextId); this.repository.release(context.contextId);
  }
}
