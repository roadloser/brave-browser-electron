import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncDataType, SyncState } from '../../../shared/contracts/sync';
import type { SyncLocalType } from '../../../shared/sync-data-ports';
import { BrowserError } from '../../../shared/errors';
import { SyncRepository, type SyncConfiguration } from './repository';
import { createChainWords, displayChainCode, parseChainCode } from './crypto/chain-code';
import { SyncEngine } from './sync-engine';
import { ChangeJournal } from './change-journal';
import { ConflictResolver } from './conflict-resolver';
import type { SyncProtocolPort } from './protocol/types';
import { SessionController } from './protocol/session-controller';

export class SyncService {
  private readonly repository: SyncRepository;
  private readonly engine: SyncEngine;
  private readonly active = new Map<string, { controller: AbortController; promise: Promise<SyncState> }>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly unsubscribe: () => void;
  private readonly unsubscribeTabs: () => void;
  private disposed = false;

  constructor(private readonly runtime: FeatureRuntime, protocol: SyncProtocolPort) {
    this.repository = new SyncRepository(runtime.storage);
    this.engine = new SyncEngine(runtime, this.repository, protocol);
    for (const profile of runtime.core.getProfiles()) {
      const config = this.repository.configuration(profile.id);
      if (config?.status === 'syncing') this.repository.saveConfiguration(profile.id, { ...config, status: 'paused', error: '上次同步在退出时中断，待发送队列已保留' });
      if (config?.encryptedWords && config.status === 'ready') this.schedule(profile.id, 1000);
    }
    this.unsubscribe = runtime.syncData.subscribe((profileId, type) => {
      const config = this.repository.configuration(profileId);
      if (!config?.encryptedWords || !config.enabledTypes.includes(type)) return;
      new ChangeJournal(runtime, this.repository).capture(profileId, config.enabledTypes.filter((candidate): candidate is SyncLocalType => ['bookmarks', 'history', 'settings', 'passwords'].includes(candidate)));
      this.publish(profileId);
      if (config.status === 'paused' || config.status === 'needs-authorization') return;
      this.schedule(profileId, 3000);
    });
    this.unsubscribeTabs = runtime.syncTabs.subscribe(profileId => {
      const config = this.repository.configuration(profileId);
      if (config?.encryptedWords && config.enabledTypes.includes('tabs') && config.status === 'ready') this.schedule(profileId, 3000);
    });
  }

  get(profileId: string): SyncState {
    const config = this.configuration(profileId);
    return {
      status: config.status, officialStatus: config.officialStatus, deviceName: config.deviceName,
      deviceId: config.encryptedWords ? config.deviceId : null, endpoint: config.endpoint,
      hasServiceKey: !!config.encryptedServiceKey, enabledTypes: config.enabledTypes,
      capabilities: [
        { dataType: 'bookmarks', status: 'implemented', reason: '真实GUID、永久根、目录和排序映射；未观察官方互通' },
        { dataType: 'history', status: 'implemented', reason: '访问与删除指令协议映射；未观察跨设备结果' },
        { dataType: 'settings', status: 'implemented', reason: '书签栏、纵向标签、启动、请勿跟踪；其余设置尚无等效映射' },
        { dataType: 'passwords', status: 'implemented', reason: 'HTML登录密码协议映射；不支持的认证类型保留错误，不覆盖远端字段' },
        { dataType: 'tabs', status: 'implemented', reason: 'SessionSpecifics设备/窗口/导航映射；远端标签由用户打开' },
      ],
      pending: this.repository.journal(profileId).length,
      conflicts: this.repository.conflicts(profileId).map(({ local: _local, remote: _remote, entity: _entity, ...conflict }) => conflict),
      lastSync: config.lastSync, error: config.error, revision: config.revision,
      ...new SessionController(this.runtime, this.repository).state(profileId),
    };
  }

  configure(context: CommandContext, input: { endpoint: string; serviceKey?: string; deviceName: string }) {
    this.assertWritable(context); this.assertIdle(context.profileId);
    const endpoint = new URL(input.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new BrowserError('INVALID_ARGUMENT', '同步服务需要完整的 HTTPS 基地址，例如 https://sync-v2.brave.com/v2');
    const previous = this.configuration(context.profileId);
    if (previous.encryptedWords && previous.endpoint.replace(/\/$/, '') !== endpoint.href.replace(/\/$/, '')) throw new BrowserError('CONFLICT', '更换同步服务器前请先离开当前同步链');
    const config = {
      ...previous, endpoint: endpoint.href.replace(/\/$/, ''), deviceName: input.deviceName,
      encryptedServiceKey: input.serviceKey === undefined ? previous.endpoint.replace(/\/$/, '') === endpoint.href.replace(/\/$/, '') ? previous.encryptedServiceKey : undefined : input.serviceKey ? this.runtime.secrets.encrypt(input.serviceKey) : undefined,
      officialStatus: 'unverified' as const, error: undefined,
    };
    this.save(context.profileId, config);
    return this.get(context.profileId);
  }
  create(context: CommandContext) {
    this.assertWritable(context); this.assertIdle(context.profileId);
    if (this.configuration(context.profileId).encryptedWords) throw new BrowserError('CONFLICT', '请先离开当前同步链');
    const words = createChainWords();
    this.save(context.profileId, { ...this.configuration(context.profileId), encryptedWords: this.runtime.secrets.encrypt(words), status: 'ready', officialStatus: 'unverified' });
    this.schedule(context.profileId, 1000);
    return displayChainCode(words);
  }
  join(context: CommandContext, code: string) {
    this.assertWritable(context); this.assertIdle(context.profileId);
    if (this.configuration(context.profileId).encryptedWords) throw new BrowserError('CONFLICT', '请先离开当前同步链');
    const words = parseChainCode(code);
    this.save(context.profileId, { ...this.configuration(context.profileId), encryptedWords: this.runtime.secrets.encrypt(words), status: 'ready', officialStatus: 'unverified' });
    this.schedule(context.profileId, 1000);
    return this.get(context.profileId);
  }
  showCode(context: CommandContext) {
    this.assertWritable(context);
    const encrypted = this.configuration(context.profileId).encryptedWords;
    if (!encrypted) throw new BrowserError('NOT_FOUND', '尚未加入同步链');
    return displayChainCode(this.runtime.secrets.decrypt(encrypted));
  }
  setTypes(context: CommandContext, types: SyncDataType[]) {
    this.assertWritable(context); this.assertIdle(context.profileId);
    this.save(context.profileId, { ...this.configuration(context.profileId), enabledTypes: [...new Set(types)] });
    return this.get(context.profileId);
  }
  run(context: CommandContext) { this.assertWritable(context); return this.runProfile(context.profileId); }
  cancel(context: CommandContext) {
    this.assertWritable(context); this.active.get(context.profileId)?.controller.abort();
    clearTimeout(this.timers.get(context.profileId)); this.timers.delete(context.profileId);
    this.save(context.profileId, { ...this.configuration(context.profileId), status: 'paused', error: undefined });
    return this.get(context.profileId);
  }
  async leave(context: CommandContext) {
    this.assertWritable(context);
    const current = this.active.get(context.profileId);
    current?.controller.abort(); await current?.promise.catch(() => undefined);
    clearTimeout(this.timers.get(context.profileId)); this.timers.delete(context.profileId);
    await this.engine.leave(context.profileId, this.configuration(context.profileId), AbortSignal.timeout(30000));
    this.repository.leave(context.profileId);
    this.publish(context.profileId);
    return this.get(context.profileId);
  }
  resolve(context: CommandContext, id: string, keep: 'local' | 'remote') {
    this.assertWritable(context); this.assertIdle(context.profileId);
    new ConflictResolver(this.runtime, this.repository).resolve(context.profileId, id, keep);
    this.save(context.profileId, { ...this.configuration(context.profileId), error: undefined });
    return this.get(context.profileId);
  }
  openRemoteTab(context: CommandContext, deviceId: string, tabId: string): Promise<void> {
    return new SessionController(this.runtime, this.repository).open(context.profileId, context.windowId, deviceId, tabId);
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.unsubscribe();
    this.unsubscribeTabs();
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const current of this.active.values()) current.controller.abort();
    await Promise.allSettled([...this.active.values()].map(current => current.promise));
    this.timers.clear();
  }

  private runProfile(profileId: string): Promise<SyncState> {
    const running = this.active.get(profileId);
    if (running) return running.promise;
    const configuration = this.configuration(profileId);
    if (!configuration.encryptedWords) return Promise.reject(new BrowserError('UNAVAILABLE', '尚未加入同步链'));
    const controller = new AbortController();
    const promise = this.execute(profileId, configuration, controller);
    this.active.set(profileId, { controller, promise });
    return promise;
  }
  private async execute(profileId: string, configuration: SyncConfiguration, controller: AbortController): Promise<SyncState> {
    this.save(profileId, { ...configuration, status: 'syncing', error: undefined });
    try {
      await this.engine.run(profileId, configuration, controller.signal);
      controller.signal.throwIfAborted();
      this.save(profileId, { ...this.configuration(profileId), status: 'ready', officialStatus: new URL(configuration.endpoint).hostname === 'sync-v2.brave.com' ? 'accepted' : 'unverified', lastSync: Date.now(), error: undefined });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const denied = error instanceof BrowserError && error.code === 'FORBIDDEN';
      const authorizationMissing = error instanceof BrowserError && /service key/.test(error.message);
      this.save(profileId, {
        ...this.configuration(profileId), status: cancelled ? 'paused' : denied || authorizationMissing ? 'needs-authorization' : 'error',
        officialStatus: denied ? 'rejected' : this.configuration(profileId).officialStatus,
        error: cancelled ? undefined : error instanceof Error ? error.message : '同步失败',
      });
    } finally {
      this.active.delete(profileId);
      if (!this.disposed && this.configuration(profileId).status === 'ready') this.schedule(profileId, 60000);
    }
    return this.get(profileId);
  }
  private configuration(profileId: string): SyncConfiguration {
    return this.repository.configuration(profileId) ?? {
      endpoint: 'https://sync-v2.brave.com/v2', deviceName: hostname(), deviceId: randomUUID(),
      enabledTypes: ['bookmarks', 'history', 'settings'], status: 'disconnected', officialStatus: 'unconfigured',
      lastSync: null, revision: 0,
    };
  }
  private save(profileId: string, configuration: SyncConfiguration): void {
    this.repository.saveConfiguration(profileId, { ...configuration, revision: configuration.revision + 1 });
    this.publish(profileId);
  }
  private publish(profileId: string): void { this.runtime.publish('sync.changed', this.get(profileId), { profileId }); }
  private assertWritable(context: CommandContext): void {
    if (context.isPrivate) throw new BrowserError('FORBIDDEN', '私密窗口不加入或修改同步链');
  }
  private assertIdle(profileId: string): void { if (this.active.has(profileId)) throw new BrowserError('CONFLICT', '请先取消当前同步操作'); }
  private schedule(profileId: string, delay: number): void {
    if (this.disposed) return;
    clearTimeout(this.timers.get(profileId));
    this.timers.set(profileId, setTimeout(() => {
      this.timers.delete(profileId);
      if (this.active.has(profileId)) return;
      void this.runProfile(profileId).catch(() => undefined);
    }, delay));
  }
}
