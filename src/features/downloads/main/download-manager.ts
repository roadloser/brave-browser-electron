import { app, shell, type DownloadItem, type Session, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { DownloadRecord, DownloadsState } from '../../../shared/contracts/downloads';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { SettingsRepository } from '../../settings/main/repository';
import { DownloadRepository } from './repository';

type LiveDownload = { record: DownloadRecord; item: DownloadItem; context: BrowserContext };
export class DownloadManager {
  private readonly repository: DownloadRepository;
  private readonly settings: SettingsRepository;
  private readonly live = new Map<string, LiveDownload>();
  private readonly privateRecords = new Map<string, Map<string, DownloadRecord>>();
  private readonly revisions = new Map<string, number>();
  private readonly sessions = new Map<string, () => void>();
  private readonly endedContexts = new Set<string>();
  private readonly disposeCore: () => void;

  constructor(private readonly runtime: FeatureRuntime) {
    this.repository = new DownloadRepository(runtime.storage);
    this.settings = new SettingsRepository(runtime.storage);
    for (const profile of runtime.core.getProfiles()) {
      for (const item of this.repository.list(profile.id)) {
        if (['progressing', 'paused'].includes(item.state)) this.repository.put(profile.id, { ...item, state: 'interrupted', canResume: false, error: '上次浏览器退出时下载未完成，可以重试' });
      }
    }
    this.disposeCore = runtime.core.onEvent(event => {
      if (event.type === 'sessionCreated') this.attach(event.context);
      if (event.type === 'contextDisposed') this.release(event.context);
    });
    for (const context of runtime.core.getContexts()) this.attach(context);
  }

  list(context: BrowserContext): DownloadsState {
    const items = context.isPrivate ? [...(this.privateRecords.get(context.contextId)?.values() ?? [])] : this.repository.list(context.profileId);
    return { items: items.map(item => ({ ...item, fileExists: !!item.savePath && existsSync(item.savePath) })).sort((first, second) => second.startedAt - first.startedAt), revision: this.revisions.get(context.contextId) ?? 0 };
  }

  control(context: CommandContext, id: string, action: 'pause' | 'resume' | 'cancel' | 'retry' | 'remove'): DownloadsState {
    const record = this.find(context, id);
    const live = this.live.get(id);
    if (action === 'pause' || action === 'resume' || action === 'cancel') {
      if (!live || live.context.contextId !== context.contextId) throw new BrowserError('UNAVAILABLE', '下载进程已结束，请使用重试');
      if (action === 'pause') live.item.pause();
      if (action === 'resume') {
        if (!live.item.canResume()) throw new BrowserError('UNAVAILABLE', '服务器不支持继续此下载，请重试');
        live.item.resume();
      }
      if (action === 'cancel') live.item.cancel();
    }
    if (action === 'retry') {
      if (['progressing', 'paused'].includes(record.state)) throw new BrowserError('CONFLICT', '下载仍在进行中');
      this.runtime.core.sessionForContext(context).downloadURL(record.url);
    }
    if (action === 'remove') {
      if (live) throw new BrowserError('CONFLICT', '请先取消下载');
      if (context.isPrivate) this.privateRecords.get(context.contextId)?.delete(id);
      else this.repository.remove(context.profileId, id);
      this.publish(context);
    }
    return this.list(context);
  }

  async open(context: CommandContext, id: string): Promise<void> {
    const record = this.find(context, id);
    if (record.state !== 'completed' || !existsSync(record.savePath)) throw new BrowserError('NOT_FOUND', '下载文件不存在或尚未完成');
    const error = await shell.openPath(record.savePath);
    if (error) throw new BrowserError('UNAVAILABLE', error);
  }
  show(context: CommandContext, id: string): void {
    const record = this.find(context, id);
    if (!existsSync(record.savePath)) throw new BrowserError('NOT_FOUND', '下载文件不存在');
    shell.showItemInFolder(record.savePath);
  }
  clear(context: CommandContext): DownloadsState {
    for (const item of this.list(context).items) {
      if (!this.live.has(item.id)) {
        if (context.isPrivate) this.privateRecords.get(context.contextId)?.delete(item.id);
        else this.repository.remove(context.profileId, item.id);
      }
    }
    this.publish(context);
    return this.list(context);
  }

  dispose(): void {
    this.disposeCore();
    for (const dispose of this.sessions.values()) dispose();
    this.sessions.clear();
    for (const live of this.live.values()) live.item.cancel();
    this.live.clear();
    this.privateRecords.clear();
  }

  private attach(context: BrowserContext): void {
    if (this.sessions.has(context.contextId)) return;
    this.endedContexts.delete(context.contextId);
    const browserSession = this.runtime.core.sessionForContext(context);
    const handler = (_event: Electron.Event, item: DownloadItem, contents: WebContents) => this.started(context, browserSession, item, contents);
    browserSession.on('will-download', handler);
    this.sessions.set(context.contextId, () => browserSession.removeListener('will-download', handler));
  }

  private started(context: BrowserContext, _session: Session, item: DownloadItem, _contents: WebContents): void {
    const preferences = this.settings.get(context.profileId);
    if (!preferences.downloadAskEachTime) {
      const directory = preferences.downloadDirectory || app.getPath('downloads');
      const filename = basename(item.getFilename()).replace(/[\x00-\x1f]/g, '_');
      let target = join(directory, filename);
      let counter = 1;
      while (existsSync(target)) { target = join(directory, '(' + counter + ') ' + filename); counter += 1; }
      item.setSavePath(target);
    } else item.setSaveDialogOptions({ title: '保存下载文件', defaultPath: preferences.downloadDirectory || app.getPath('downloads') });
    const record: DownloadRecord = {
      id: randomUUID(), url: item.getURL(), filename: item.getFilename(),
      savePath: item.getSavePath(), mimeType: item.getMimeType(), state: 'progressing',
      receivedBytes: 0, totalBytes: item.getTotalBytes(), startedAt: Date.now(),
      updatedAt: Date.now(), canResume: false, fileExists: false,
    };
    this.live.set(record.id, { record, item, context });
    const update = (state: string) => {
      record.state = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing';
      record.receivedBytes = item.getReceivedBytes(); record.totalBytes = item.getTotalBytes();
      record.savePath = item.getSavePath(); record.canResume = item.canResume(); record.updatedAt = Date.now();
      this.save(context, record);
    };
    item.on('updated', (_event, state) => update(state));
    item.once('done', (_event, state) => {
      record.state = state; record.receivedBytes = item.getReceivedBytes();
      record.savePath = item.getSavePath(); record.canResume = false;
      record.error = state === 'interrupted' ? '下载中断，可重新下载' : undefined;
      record.updatedAt = Date.now(); this.live.delete(record.id);
      this.save(context, record);
    });
    this.save(context, record);
  }

  private find(context: BrowserContext, id: string) {
    const record = this.list(context).items.find(item => item.id === id);
    if (!record) throw new BrowserError('NOT_FOUND', '下载记录不存在');
    return record;
  }
  private save(context: BrowserContext, record: DownloadRecord): void {
    if (context.isPrivate && this.endedContexts.has(context.contextId)) return;
    try {
    if (context.isPrivate) {
      const records = this.privateRecords.get(context.contextId) ?? new Map<string, DownloadRecord>();
      records.set(record.id, { ...record }); this.privateRecords.set(context.contextId, records);
    } else this.repository.put(context.profileId, record);
    this.publish(context);
    } catch {
      this.runtime.publish('app.error', { code: 'STORAGE_FAILED', message: '下载记录保存失败，文件传输状态仍保留在内存中', recoverable: true }, { contextId: context.contextId });
    }
  }
  private publish(context: BrowserContext): void {
    this.revisions.set(context.contextId, (this.revisions.get(context.contextId) ?? 0) + 1);
    this.runtime.publish('downloads.changed', this.list(context), { contextId: context.contextId });
  }
  private release(context: BrowserContext): void {
    this.endedContexts.add(context.contextId);
    this.sessions.get(context.contextId)?.(); this.sessions.delete(context.contextId);
    for (const live of this.live.values()) if (live.context.contextId === context.contextId) live.item.cancel();
    this.privateRecords.delete(context.contextId); this.revisions.delete(context.contextId);
  }
}
