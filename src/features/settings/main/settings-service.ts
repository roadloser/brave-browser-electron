import { dialog } from 'electron';
import { BrowserError } from '../../../shared/errors';
import type { BrowserSettings, SettingsState } from '../../../shared/contracts/settings';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { defaultSettings, SettingsRepository } from './repository';

export class SettingsService {
  private readonly repository: SettingsRepository;
  private readonly revisions = new Map<string, number>();
  private readonly disposeEvents: () => void;
  private readonly headerDisposers = new Map<string, () => void>();
  private readonly listeners = new Set<(profileId: string) => void>();

  constructor(private readonly runtime: FeatureRuntime) {
    this.repository = new SettingsRepository(runtime.storage);
    for (const profile of runtime.core.getProfiles()) this.apply(profile.id);
    this.disposeEvents = runtime.core.onEvent(event => {
      if (event.type === 'sessionCreated') {
        this.apply(event.context.profileId);
        this.headerDisposers.set(event.context.contextId, runtime.requests.attachHeaders(runtime.core.sessionForContext(event.context), details => {
          const headers = { ...details.requestHeaders };
          if (this.repository.get(event.context.profileId).doNotTrack) headers.DNT = '1';
          return headers;
        }));
      }
      if (event.type === 'contextDisposed') {
        this.headerDisposers.get(event.context.contextId)?.();
        this.headerDisposers.delete(event.context.contextId);
      }
    });
  }
  get(profileId: string): SettingsState {
    return { values: this.repository.get(profileId), revision: this.revisions.get(profileId) ?? 0 };
  }
  update(context: CommandContext, patch: Partial<BrowserSettings>): SettingsState {
    if (context.isPrivate) throw new BrowserError('FORBIDDEN', '请在普通窗口修改资料设置');
    const next = { ...this.repository.get(context.profileId), ...patch };
    this.repository.set(context.profileId, next);
    this.revisions.set(context.profileId, (this.revisions.get(context.profileId) ?? 0) + 1);
    this.apply(context.profileId);
    const state = this.get(context.profileId);
    this.runtime.publish('settings.changed', state, { profileId: context.profileId, includePrivate: true });
    for (const listener of this.listeners) listener(context.profileId);
    return state;
  }
  reset(context: CommandContext) { return this.update(context, defaultSettings); }
  subscribe(listener: (profileId: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  notifyImported(profileId: string): void {
    this.revisions.set(profileId, (this.revisions.get(profileId) ?? 0) + 1);
    this.apply(profileId);
    this.runtime.publish('settings.changed', this.get(profileId), { profileId, includePrivate: true });
    for (const listener of this.listeners) listener(profileId);
  }
  async chooseDownloadDirectory(context: CommandContext) {
    const result = await dialog.showOpenDialog(this.runtime.core.getNativeWindow(context.windowId), {
      title: '选择下载文件夹', properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? this.get(context.profileId) : this.update(context, { downloadDirectory: result.filePaths[0] });
  }
  dispose(): void { this.disposeEvents(); for (const dispose of this.headerDisposers.values()) dispose(); this.headerDisposers.clear(); }
  private apply(profileId: string): void { this.runtime.core.configureProfile(profileId, this.repository.get(profileId)); }
}
