import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { SiteDataClearResult, SiteDataDetails, SiteDataState } from '../../../shared/contracts/site-data';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { SiteDataInspector } from '../../../main/platform/runtime/site-data-inspector';
import { SiteOriginRepository } from './site-origin-repository';
import { recordSiteOrigins } from './site-origin-recorder';
import { cookieMatchesOrigin, cookieMetadata, sourceOrigin } from './cookie-scope';
import type { PermissionService } from './permission-service';

const coverageLimitations = [
  '列表来自本应用已观察的网页来源、权限规则和 Cookie 来源，不能枚举所有尚未观察的磁盘存储。',
  'Cookie 按域和路径共享，不按端口隔离；同一 Cookie 可能出现在多个来源下。',
  '显示的存储大小只包含当前来源第一方 quota 管理的数据，不含 localStorage、所有分区数据或 HTTP 缓存。',
];
export class SiteDataService {
  private readonly repository: SiteOriginRepository;
  private readonly inspectors = new Map<string, SiteDataInspector>();
  private readonly revisions = new Map<string, number>();
  private readonly usage = new Map<string, Map<string, number>>();
  private readonly refreshing = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly cookieSubscriptions = new Map<string, () => void>();
  private readonly busy = new Set<string>();
  private disposed = false;
  private readonly disposeRecords: () => void;
  private readonly disposeCore: () => void;

  constructor(private readonly runtime: FeatureRuntime, private readonly permissions: PermissionService) {
    this.repository = new SiteOriginRepository(runtime.storage);
    this.disposeRecords = recordSiteOrigins(runtime, this.repository, contextId => this.schedule(contextId));
    this.disposeCore = runtime.core.onEvent(event => {
      if (event.type === 'sessionCreated') this.attach(event.context);
      if (event.type === 'contextDisposed') this.release(event.context.contextId);
    });
    for (const context of runtime.core.getContexts()) this.attach(context);
  }

  async list(context: BrowserContext, query = ''): Promise<SiteDataState> {
    this.assertContext(context);
    const cookies = await this.inspector(context).cookies();
    this.assertContext(context);
    const origins = new Map(this.repository.list(context).map(value => [value.origin, value.lastSeen]));
    const rules = this.permissions.get(context).rules;
    for (const rule of rules) if (!origins.has(rule.origin)) origins.set(rule.origin, rule.updatedAt);
    for (const cookie of cookies) {
      const origin = sourceOrigin(cookie);
      if (origin && !origins.has(origin)) origins.set(origin, 0);
    }
    const scopes = new Map<string, SiteDataState['cookieScopes'][number]>();
    for (const cookie of cookies) {
      const key = cookie.domain + ':' + Boolean(cookie.partitionKey || cookie.partitionKeyOpaque);
      const existing = scopes.get(key);
      if (existing) existing.count += 1;
      else scopes.set(key, { domain: cookie.domain, hostOnly: !cookie.domain.startsWith('.'), count: 1, partitioned: Boolean(cookie.partitionKey || cookie.partitionKeyOpaque) });
    }
    const filter = query.trim().toLocaleLowerCase();
    return {
      sites: [...origins].filter(([origin]) => !filter || origin.toLocaleLowerCase().includes(filter)).map(([origin, lastSeen]) => ({
        origin, lastSeen, cookieCount: cookies.filter(cookie => cookieMatchesOrigin(cookie, origin)).length,
        storageBytes: this.usage.get(context.contextId)?.get(origin) ?? null,
        permissionsCount: rules.filter(rule => rule.origin === origin).length,
      })).sort((first, second) => second.lastSeen - first.lastSeen || first.origin.localeCompare(second.origin)),
      cookieScopes: [...scopes.values()].filter(scope => !filter || scope.domain.toLocaleLowerCase().includes(filter)),
      coverage: 'observed-origins', limitations: coverageLimitations, revision: this.revisions.get(context.contextId) ?? 0,
    };
  }

  async details(context: BrowserContext, origin: string): Promise<SiteDataDetails> {
    this.assertContext(context);
    const inspector = this.inspector(context);
    const cookies = (await inspector.cookies()).filter(cookie => cookieMatchesOrigin(cookie, origin));
    const limitations = [...coverageLimitations];
    if (cookies.some(cookie => cookie.partitionKeyOpaque)) limitations.push('存在不透明分区 Cookie，当前清理接口不能精确指定它；该项会保留并报告失败。');
    let totalUsage: number | null = null;
    let quota: number | null = null;
    let storageUsage: SiteDataDetails['storageUsage'] = [];
    try {
      const measured = await inspector.usage(origin);
      totalUsage = measured.usage; quota = measured.quota; storageUsage = measured.usageBreakdown;
      const cache = this.usage.get(context.contextId) ?? new Map<string, number>();
      cache.set(origin, totalUsage); this.usage.set(context.contextId, cache);
    } catch (error) { limitations.push(error instanceof Error ? error.message : '存储用量暂时不可用'); }
    this.assertContext(context);
    return { origin, cookies: cookies.map(cookieMetadata), totalUsage, quota, storageUsage, limitations };
  }

  async clear(context: CommandContext, input: { origin: string; cookies: boolean; storage: boolean; permissions: boolean }): Promise<SiteDataClearResult> {
    this.assertContext(context);
    if (!input.cookies && !input.storage && !input.permissions) throw new BrowserError('INVALID_ARGUMENT', '请选择至少一类要清理的数据');
    if (this.busy.has(context.contextId)) throw new BrowserError('CONFLICT', '此上下文正在清理站点数据，请等待完成');
    this.busy.add(context.contextId);
    const result: SiteDataClearResult = { cleared: false, steps: [] };
    const step = async (kind: 'cookies' | 'storage' | 'permissions', enabled: boolean, action: () => void | Promise<void>) => {
      if (!enabled) { result.steps.push({ kind, status: 'skipped' }); return; }
      try { this.assertContext(context); await action(); result.steps.push({ kind, status: 'cleared' }); }
      catch (error) { result.steps.push({ kind, status: 'failed', error: error instanceof Error ? error.message : '操作失败' }); }
    };
    try {
      await step('cookies', input.cookies, async () => {
        const inspector = this.inspector(context);
        const cookies = (await inspector.cookies()).filter(cookie => cookieMatchesOrigin(cookie, input.origin));
        result.affectedCookieScope = [...new Set(cookies.map(cookie => cookie.domain + ' · ' + cookie.path + (cookie.partitionKey ? ' · 分区 ' + cookie.partitionKey.topLevelSite : cookie.partitionKeyOpaque ? ' · 不透明分区' : ' · 非分区')))];
        let failures = 0;
        for (const cookie of cookies) {
          this.assertContext(context);
          try { await inspector.removeCookie(cookie); } catch { failures += 1; }
        }
        if (failures) throw new BrowserError('UNAVAILABLE', String(failures) + ' 个 Cookie 未清除；其他成功项已删除，可刷新后重试');
      });
      await step('storage', input.storage, async () => {
        await this.runtime.core.sessionForContext(context).clearData({
          origins: [input.origin], originMatchingMode: 'origin-in-all-contexts',
          dataTypes: ['backgroundFetch', 'cache', 'fileSystems', 'indexedDB', 'localStorage', 'serviceWorkers', 'webSQL'],
        });
        this.usage.get(context.contextId)?.delete(input.origin);
      });
      await step('permissions', input.permissions, () => this.permissions.resetOrigin(context, input.origin));
      result.cleared = result.steps.every(value => value.status !== 'failed');
      this.bump(context.contextId);
      await this.publish(context);
      return result;
    } finally { this.busy.delete(context.contextId); }
  }
  resetPermissions(context: CommandContext, origin: string): Promise<SiteDataClearResult> {
    return this.clear(context, { origin, cookies: false, storage: false, permissions: true });
  }
  dispose(): void {
    this.disposed = true;
    this.disposeRecords(); this.disposeCore();
    for (const contextId of [...this.inspectors.keys(), ...this.cookieSubscriptions.keys()]) this.release(contextId);
  }

  private inspector(context: BrowserContext): SiteDataInspector {
    const existing = this.inspectors.get(context.contextId);
    if (existing) return existing;
    const inspector = new SiteDataInspector(this.runtime.core.sessionForContext(context));
    this.inspectors.set(context.contextId, inspector); return inspector;
  }
  private assertContext(context: BrowserContext): void {
    if (this.disposed) throw new BrowserError('CANCELLED', '站点数据服务已关闭');
    const actual = this.runtime.core.getContexts().find(value => value.contextId === context.contextId);
    if (!actual || actual.profileId !== context.profileId || actual.isPrivate !== context.isPrivate) throw new BrowserError('CANCELLED', '浏览器上下文已关闭，数据操作已取消');
  }
  private attach(context: BrowserContext): void {
    if (this.cookieSubscriptions.has(context.contextId)) return;
    const cookies = this.runtime.core.sessionForContext(context).cookies;
    const changed = () => this.schedule(context.contextId);
    cookies.on('changed', changed);
    this.cookieSubscriptions.set(context.contextId, () => cookies.removeListener('changed', changed));
  }
  private schedule(contextId: string): void {
    if (this.disposed) return;
    this.bump(contextId);
    if (!this.inspectors.has(contextId)) return;
    clearTimeout(this.timers.get(contextId));
    this.timers.set(contextId, setTimeout(() => {
      this.timers.delete(contextId);
      const context = this.runtime.core.getContexts().find(value => value.contextId === contextId);
      if (context) void this.publish(context);
    }, 250));
  }
  private async publish(context: BrowserContext): Promise<void> {
    if (this.disposed || this.refreshing.has(context.contextId)) return;
    this.refreshing.add(context.contextId);
    try {
      const state = await this.list(context);
      if (!this.disposed) this.runtime.publish('siteData.changed', state, { contextId: context.contextId });
    }
    catch { return; }
    finally { this.refreshing.delete(context.contextId); }
  }
  private bump(contextId: string): void { this.revisions.set(contextId, (this.revisions.get(contextId) ?? 0) + 1); }
  private release(contextId: string): void {
    this.inspectors.get(contextId)?.dispose(); this.inspectors.delete(contextId);
    this.cookieSubscriptions.get(contextId)?.(); this.cookieSubscriptions.delete(contextId);
    clearTimeout(this.timers.get(contextId)); this.timers.delete(contextId);
    this.repository.release(contextId); this.revisions.delete(contextId); this.usage.delete(contextId); this.busy.delete(contextId);
  }
}
