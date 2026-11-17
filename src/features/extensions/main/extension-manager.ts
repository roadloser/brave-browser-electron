import { BrowserWindow } from 'electron';
import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { BrowserContext, BrowserSnapshot } from '../../../shared/contracts/browser-core';
import type { ExtensionsState } from '../../../shared/contracts/extensions';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { ExtensionRepository } from './extension-repository';
import { InstallProposals } from './install-proposals';
import { ExtensionLibraryAdapter } from './library-adapter';
import { ExtensionPopupController } from './popup-controller';
import { ExtensionVersionInstaller } from './version-installer';
import type { ExtensionLibraryPort } from './library-port';
import { ChromeWebStoreAdapter } from './web-store-adapter';

export class ExtensionManager {
  private readonly proposals;
  private readonly popup;
  private readonly adapters = new Map<string, ExtensionLibraryPort>();
  private readonly starting = new Map<string, Promise<void>>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly stopCore;
  private latestState?: BrowserSnapshot;
  private readonly knownWindows = new Map<string, BrowserSnapshot['windows'][number]>();
  private disposed = false;

  constructor(private readonly runtime: FeatureRuntime) {
    this.proposals = new InstallProposals(runtime, new ChromeWebStoreAdapter());
    this.popup = new ExtensionPopupController(runtime);
    this.stopCore = runtime.core.onEvent(event => {
      if (event.type === 'sessionCreated' && !event.context.isPrivate) void this.ensure(event.context).catch(error => this.report(event.context.profileId, error));
      if (event.type === 'stateChanged') {
        for (const window of event.state.windows) this.knownWindows.set(window.id, window);
        this.latestState = { ...event.state, windows: [...this.knownWindows.values()] };
        for (const adapter of this.adapters.values()) {
          try { adapter.synchronize(this.latestState); } catch (error) { this.report(adapter.profileId, error); }
        }
      }
      if (event.type === 'tabClosed') {
        const window = this.knownWindows.get(event.windowId);
        if (window) this.knownWindows.set(window.id, { ...window, tabs: window.tabs.filter(tab => tab.id !== event.tabId) });
      }
      if (event.type === 'contextDisposed') {
        for (const [windowId, window] of this.knownWindows) if (window.contextId === event.context.contextId) this.knownWindows.delete(windowId);
      }
    });
  }

  async start(): Promise<void> {
    for (const nativeWindow of BrowserWindow.getAllWindows()) {
      const window = this.runtime.core.getWindowForSender(nativeWindow.webContents.id);
      if (window) { this.latestState = this.runtime.core.getState(window.id); break; }
    }
    for (const context of this.runtime.core.getContexts()) if (!context.isPrivate) await this.ensure(context);
  }

  async get(context: CommandContext): Promise<ExtensionsState> {
    if (!context.isPrivate) await this.ensure(context);
    return this.state(context.profileId, context.isPrivate);
  }

  async chooseDirectory(context: CommandContext) { this.regular(context); await this.ensure(context); return this.proposals.chooseDirectory(context); }
  async proposeStoreInstall(context: CommandContext, extensionId: string) {
    this.regular(context); await this.ensure(context);
    const existing = this.repository(context.profileId).get(extensionId);
    return this.proposals.store(context, extensionId, existing);
  }
  async proposeUpdate(context: CommandContext, id: string) {
    this.regular(context); await this.ensure(context);
    const extension = this.required(context.profileId, id);
    return extension.source === 'web-store'
      ? this.proposals.store(context, extension.id, extension)
      : this.proposals.directory(context, extension.sourcePath ?? extension.path, extension);
  }

  async confirmInstall(context: CommandContext, proposalId: string, approve: boolean) {
    this.regular(context); await this.ensure(context);
    const proposal = this.proposals.take(context, proposalId);
    if (!approve) { await rm(proposal.cleanupPath, { recursive: true, force: true }); return this.state(context.profileId); }
    return this.enqueue(context.profileId, async () => {
      if (proposal.replacesId) this.popup.closeExtension(proposal.replacesId);
      await this.installer(context).install(proposal);
      return this.changed(context.profileId);
    });
  }

  async setEnabled(context: CommandContext, id: string, enabled: boolean) {
    this.regular(context); await this.ensure(context);
    return this.enqueue(context.profileId, async () => {
      const repository = this.repository(context.profileId);
      const extension = this.required(context.profileId, id);
      const session = this.runtime.core.sessionForContext(context);
      this.popup.closeExtension(id);
      if (enabled) {
        try {
          await session.extensions.loadExtension(extension.path, { allowFileAccess: false });
          repository.save({ ...extension, enabled: true, status: 'loaded', error: undefined });
        } catch (error) {
          repository.save({ ...extension, enabled: false, status: 'failed', error: '扩展加载失败，原文件已保留，请重新加载或更新' });
          this.changed(context.profileId);
          throw error;
        }
      } else {
        session.extensions.removeExtension(id);
        repository.save({ ...extension, enabled: false, status: 'disabled', error: undefined });
      }
      return this.changed(context.profileId);
    });
  }

  async reload(context: CommandContext, id: string) {
    this.regular(context); await this.ensure(context);
    return this.enqueue(context.profileId, async () => {
      const extension = this.required(context.profileId, id);
      if (!extension.enabled) throw new BrowserError('CONFLICT', '请先启用扩展');
      const session = this.runtime.core.sessionForContext(context);
      this.popup.closeExtension(id);
      session.extensions.removeExtension(id);
      try {
        await session.extensions.loadExtension(extension.path, { allowFileAccess: false });
        this.repository(context.profileId).save({ ...extension, status: 'loaded', error: undefined });
      } catch (error) {
        this.repository(context.profileId).save({ ...extension, status: 'failed', error: '重新加载失败，文件已保留，可重试或更新' });
        this.changed(context.profileId);
        throw error;
      }
      return this.changed(context.profileId);
    });
  }

  async cancelPending(context: CommandContext) {
    this.regular(context);
    await this.proposals.cancel(context);
    return this.state(context.profileId);
  }

  async remove(context: CommandContext, id: string, clearData = false) {
    this.regular(context); await this.ensure(context);
    if (clearData) throw new BrowserError('UNAVAILABLE', '当前运行时尚不能保证完整清除chrome.storage扩展数据；可选择保留数据后移除，不会伪报已擦除');
    return this.enqueue(context.profileId, async () => {
      const extension = this.required(context.profileId, id);
      this.popup.closeExtension(id);
      this.runtime.core.sessionForContext(context).extensions.removeExtension(id);
      this.repository(context.profileId).remove(id);
      await rm(dirname(extension.path), { recursive: true, force: true }).catch(() => {
        this.report(context.profileId, new Error('扩展已停用并移除，旧安装文件清理失败'));
      });
      return this.changed(context.profileId);
    });
  }

  async openAction(context: CommandContext, id: string, tabId: string) {
    this.regular(context); await this.ensure(context);
    const tab = this.runtime.core.getTab(tabId);
    if (tab.windowId !== context.windowId || tab.contextId !== context.contextId || tab.profileId !== context.profileId) throw new BrowserError('FORBIDDEN', '扩展不能操作其他窗口中的标签');
    const extension = this.required(context.profileId, id);
    if (!extension.enabled || extension.status !== 'loaded') throw new BrowserError('UNAVAILABLE', '扩展未启用或加载失败');
    return { opened: await this.adapters.get(context.profileId)!.activate(id, tabId) };
  }
  closeAction(context: CommandContext): void { this.popup.close(context.windowId); }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopCore();
    this.popup.dispose();
    await Promise.allSettled([...this.queues.values(), ...this.starting.values()]);
    for (const adapter of this.adapters.values()) adapter.dispose();
    this.adapters.clear();
    await this.proposals.dispose();
  }

  private ensure(context: BrowserContext): Promise<void> {
    const existing = this.starting.get(context.profileId);
    if (existing) return existing;
    const promise = this.restore(context);
    this.starting.set(context.profileId, promise);
    promise.catch(() => this.starting.delete(context.profileId));
    return promise;
  }

  private async restore(context: BrowserContext): Promise<void> {
    if (this.disposed) return;
    const adapter = new ExtensionLibraryAdapter(this.runtime, context, this.popup);
    this.adapters.set(context.profileId, adapter);
    if (this.latestState) adapter.synchronize(this.latestState);
    await this.installer(context).recover();
    const repository = this.repository(context.profileId);
    const session = this.runtime.core.sessionForContext(context);
    for (const extension of repository.list()) {
      if (!extension.enabled) continue;
      try {
        await session.extensions.loadExtension(extension.path, { allowFileAccess: false });
        repository.save({ ...extension, status: 'loaded', error: undefined });
      } catch {
        repository.save({ ...extension, status: 'failed', error: '扩展恢复失败，请重新加载或更新；原文件已保留' });
      }
    }
    this.changed(context.profileId);
  }

  private installer(context: BrowserContext) { return new ExtensionVersionInstaller(this.repository(context.profileId), this.runtime.core.sessionForContext(context), context.profileId); }
  private repository(profileId: string) { return new ExtensionRepository(this.runtime.storage.open(profileId)); }
  private required(profileId: string, id: string) {
    const record = this.repository(profileId).get(id);
    if (!record) throw new BrowserError('NOT_FOUND', '扩展不存在或已移除');
    return record;
  }
  private state(profileId: string, isPrivate = false): ExtensionsState {
    const repository = this.repository(profileId);
    return { extensions: isPrivate ? [] : repository.list(), revision: repository.revision(), networkInterception: 'unavailable-native-shields', privateExtensions: 'unsupported' };
  }
  private changed(profileId: string) {
    const state = this.state(profileId);
    this.runtime.publish('extensions.changed', state, { profileId });
    return state;
  }
  private regular(context: BrowserContext): void {
    if (context.isPrivate) throw new BrowserError('UNAVAILABLE', '临时 Session 不支持扩展，请在普通窗口管理扩展');
  }
  private enqueue<Value>(profileId: string, operation: () => Promise<Value>): Promise<Value> {
    const next = (this.queues.get(profileId) ?? Promise.resolve()).catch(() => undefined).then(operation);
    this.queues.set(profileId, next);
    void next.finally(() => { if (this.queues.get(profileId) === next) this.queues.delete(profileId); }).catch(() => undefined);
    return next;
  }
  private report(profileId: string, error: unknown): void {
    this.runtime.publish('app.error', { code: 'UNAVAILABLE', message: error instanceof Error ? error.message : '扩展服务失败', recoverable: true }, { profileId });
  }
}
