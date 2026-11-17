import { dialog } from 'electron';
import { setTimeout as delay } from 'node:timers/promises';
import type { FeatureRuntime, CommandContext } from '../../../shared/module-lifecycle';
import type { TorState } from '../../../shared/contracts/tor';
import { BrowserError } from '../../../shared/errors';
import { TorRepository } from './repository';
import { readTorComponent } from './component-descriptor';
import { TorProcessAdapter } from './tor-process-adapter';
import { TorProxySession } from './proxy-session';
import type { TorRuntimePort } from './runtime-port';

type Connection = {
  runtime: TorRuntimePort; proxy: TorProxySession; controller: AbortController;
  operation?: Promise<TorState>; stopping: boolean; replacing: boolean;
};

export class TorService {
  private readonly repository: TorRepository;
  private readonly states = new Map<string, TorState>();
  private readonly connections = new Map<string, Connection>();
  private readonly disposeCore: () => void;

  constructor(private readonly runtime: FeatureRuntime) {
    this.repository = new TorRepository(runtime.storage);
    this.disposeCore = runtime.core.onEvent(event => {
      if (event.type !== 'contextDisposed' || event.context.kind !== 'tor') return;
      const connection = this.connections.get(event.context.profileId);
      if (connection && !connection.stopping && !connection.replacing && connection.proxy.contextId() === event.context.contextId) {
        void this.stopProfile(event.context.profileId).catch(() => undefined);
      }
    });
  }

  get(profileId: string): TorState {
    const component = this.repository.get(profileId);
    return this.states.get(profileId) ?? {
      phase: component.current ? 'stopped' : 'unconfigured', bootstrapProgress: 0,
      summary: component.current ? 'Tor 组件已选择，尚未连接' : '选择已验证的官方 Tor 组件',
      version: component.current?.version ?? null, componentHash: component.current?.manifestHash ?? null,
      canRollback: !!component.previous, contextId: null, revision: 0,
      capabilities: { isolation: 'context', siteCircuits: false, dns: 'proxy-resolution-unobserved', webRtc: 'non-proxied-udp-disabled-unobserved' },
    };
  }

  async chooseComponent(context: CommandContext): Promise<TorState> {
    this.assertStopped(context.profileId);
    const choice = await dialog.showOpenDialog(this.runtime.core.getNativeWindow(context.windowId), {
      title: '选择已验证的官方 Tor 组件目录', properties: ['openDirectory'],
      message: '目录须包含 tor-component.json 和已按 Tor Project 官方签名或校验材料验证的组件文件。',
    });
    if (choice.canceled || !choice.filePaths[0]) return this.get(context.profileId);
    const component = await readTorComponent(choice.filePaths[0]);
    const confirmation = await dialog.showMessageBox(this.runtime.core.getNativeWindow(context.windowId), {
      type: 'warning', title: '确认 Tor 组件来源',
      message: '此清单和 SHA-256 只检查文件一致性，不能证明发行者身份。',
      detail: '请确认您已按 Tor Project 官方材料验证此组件。\n版本：' + component.version + '\n来源：' + component.sourceUrl + '\n验证依据：' + component.verificationUrl + '\n清单摘要：' + component.manifestHash,
      buttons: ['取消', '已验证官方来源，使用此组件'], defaultId: 0, cancelId: 0,
    });
    if (confirmation.response !== 1) return this.get(context.profileId);
    this.repository.select(context.profileId, component);
    this.update(context.profileId, { phase: 'stopped', summary: '组件已登记，可连接 Tor', version: component.version, componentHash: component.manifestHash, canRollback: !!this.repository.get(context.profileId).previous, error: undefined });
    return this.get(context.profileId);
  }

  start(context: CommandContext): Promise<TorState> {
    const current = this.connections.get(context.profileId);
    if (current?.operation) return current.operation;
    if (current && this.get(context.profileId).phase === 'connected') {
      return this.runtime.core.openTorWindow(context.profileId, async () => undefined).then(() => this.get(context.profileId));
    }
    this.assertStopped(context.profileId);
    const component = this.repository.get(context.profileId).current;
    if (!component) return Promise.reject(new BrowserError('UNAVAILABLE', '请先选择并验证官方 Tor 组件'));
    const connection: Connection = {
      runtime: new TorProcessAdapter(reason => { void this.fail(context.profileId, reason).catch(() => undefined); }),
      proxy: new TorProxySession(), controller: new AbortController(), stopping: false, replacing: false,
    };
    this.connections.set(context.profileId, connection);
    const operation = this.startConnection(context.profileId, connection, component);
    connection.operation = operation;
    void operation.finally(() => { connection.operation = undefined; }).catch(() => undefined);
    return operation;
  }

  async stop(context: CommandContext): Promise<TorState> { await this.stopProfile(context.profileId); return this.get(context.profileId); }
  async newIdentity(context: CommandContext): Promise<TorState> {
    const connection = this.connections.get(context.profileId);
    if (!connection || connection.operation || this.get(context.profileId).phase !== 'connected') throw new BrowserError('CONFLICT', 'Tor 尚未连接或正在处理其他操作');
    connection.replacing = true;
    try {
      this.update(context.profileId, { phase: 'starting', summary: '正在关闭旧 Tor 上下文并更换身份' });
      await connection.proxy.block();
      const contextId = connection.proxy.contextId();
      if (contextId) await this.runtime.core.closeContext(contextId);
      connection.proxy.release();
      await connection.runtime.newIdentity();
      await delay(1000, undefined, { signal: connection.controller.signal });
      const bootstrap = await connection.runtime.bootstrap();
      if (!bootstrap.circuitEstablished) throw new BrowserError('UNAVAILABLE', '新 Tor 身份尚未建立可用线路');
      const endpoint = this.runtime.core.getContexts().find(candidate => candidate.contextId === contextId);
      if (endpoint) throw new BrowserError('CONFLICT', '旧 Tor 上下文尚未释放');
      const socksPort = this.socksPorts.get(context.profileId);
      if (!socksPort) throw new BrowserError('UNAVAILABLE', 'Tor SOCKS 端点已失效');
      await this.runtime.core.openTorWindow(context.profileId, (nextContext, browserSession) => connection.proxy.prepare(nextContext, browserSession, socksPort));
      connection.proxy.connected();
      this.update(context.profileId, { phase: 'connected', summary: '新的 Tor 上下文已连接', bootstrapProgress: 100, contextId: connection.proxy.contextId(), error: undefined });
    } catch (error) { await this.fail(context.profileId, error instanceof Error ? error.message : '更换 Tor 身份失败'); }
    finally { connection.replacing = false; }
    return this.get(context.profileId);
  }
  async rollback(context: CommandContext): Promise<TorState> {
    this.assertStopped(context.profileId);
    const previous = this.repository.get(context.profileId).previous;
    if (!previous) throw new BrowserError('NOT_FOUND', '没有可回滚的 Tor 组件记录');
    const checked = await readTorComponent(previous.directory);
    if (checked.manifestHash !== previous.manifestHash) throw new BrowserError('CONFLICT', '上一个组件已发生变化，不能回滚');
    this.repository.rollback(context.profileId);
    this.update(context.profileId, { phase: 'stopped', version: previous.version, componentHash: previous.manifestHash, summary: '已回滚到上一个固定组件', error: undefined });
    return this.get(context.profileId);
  }
  async dispose(): Promise<void> {
    this.disposeCore();
    for (const profileId of [...this.connections.keys()]) await this.stopProfile(profileId);
  }

  private readonly socksPorts = new Map<string, number>();
  private async startConnection(profileId: string, connection: Connection, component: NonNullable<ReturnType<TorRepository['get']>['current']>): Promise<TorState> {
    this.update(profileId, { phase: 'starting', summary: '正在校验并启动 Tor 组件', bootstrapProgress: 0, error: undefined });
    try {
      const endpoint = await connection.runtime.start(component, connection.controller.signal);
      connection.controller.signal.throwIfAborted();
      this.socksPorts.set(profileId, endpoint.socksPort);
      await this.runtime.core.openTorWindow(profileId, (context, browserSession) => connection.proxy.prepare(context, browserSession, endpoint.socksPort));
      connection.controller.signal.throwIfAborted();
      this.update(profileId, { phase: 'bootstrapping', summary: '正在建立 Tor 线路', contextId: connection.proxy.contextId(), version: endpoint.version });
      await connection.runtime.enableNetwork();
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        connection.controller.signal.throwIfAborted();
        const bootstrap = await connection.runtime.bootstrap();
        this.update(profileId, { bootstrapProgress: bootstrap.progress, summary: bootstrap.summary });
        if (bootstrap.progress === 100 && bootstrap.circuitEstablished) {
          connection.proxy.connected();
          this.update(profileId, { phase: 'connected', summary: 'Tor 已连接 · 上下文级隔离' });
          return this.get(profileId);
        }
        await delay(750, undefined, { signal: connection.controller.signal });
      }
      throw new BrowserError('UNAVAILABLE', 'Tor 线路建立超时，请检查网络或更换已验证组件后重试');
    } catch (error) {
      if (!connection.stopping) await this.fail(profileId, error instanceof Error ? error.message : 'Tor 连接失败');
      return this.get(profileId);
    }
  }
  private async stopProfile(profileId: string): Promise<void> {
    const connection = this.connections.get(profileId);
    if (!connection || connection.stopping) return;
    connection.stopping = true; connection.controller.abort();
    this.update(profileId, { phase: 'stopping', summary: '正在关闭 Tor 连接' });
    await connection.proxy.block();
    await connection.operation?.catch(() => undefined);
    const contextId = connection.proxy.contextId();
    if (contextId) await this.runtime.core.closeContext(contextId);
    await connection.runtime.stop();
    connection.proxy.release(); this.connections.delete(profileId); this.socksPorts.delete(profileId);
    this.update(profileId, { phase: 'stopped', summary: 'Tor 已断开', contextId: null, bootstrapProgress: 0 });
  }
  private async fail(profileId: string, reason: string): Promise<void> {
    const connection = this.connections.get(profileId);
    if (connection?.stopping) return;
    if (connection) {
      connection.stopping = true; connection.controller.abort();
      await connection.proxy.block();
      const contextId = connection.proxy.contextId();
      if (contextId) {
        try { await this.runtime.core.closeContext(contextId); } catch {}
      }
      await connection.runtime.stop();
    }
    this.connections.delete(profileId); this.socksPorts.delete(profileId);
    this.update(profileId, { phase: 'failed', summary: 'Tor 连接失败，网页网络已阻断', error: reason, contextId: null });
  }
  private update(profileId: string, patch: Partial<TorState>): void {
    const previous = this.get(profileId);
    const next = { ...previous, ...patch, revision: previous.revision + 1 };
    this.states.set(profileId, next);
    this.runtime.publish('tor.changed', next, { profileId, includePrivate: true });
  }
  private assertStopped(profileId: string): void {
    if (this.connections.has(profileId)) throw new BrowserError('CONFLICT', '请先关闭当前 Tor 连接');
  }
}
