import { randomUUID } from 'node:crypto';
import type { NewTabPreferences, NewTabState } from '../../../shared/contracts/new-tab';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { defaultNewTabState, NewTabPreferencesRepository } from './preferences-repository';
import { chooseBackground } from './background-import';

export class NewTabService {
  private readonly privateStates = new Map<string, NewTabState>();
  private readonly disposedContexts = new Set<string>();
  private readonly disposeEvents: () => void;
  constructor(private readonly runtime: FeatureRuntime) {
    this.disposeEvents = runtime.core.onEvent((event) => {
      if (event.type === 'contextDisposed') {
        this.privateStates.delete(event.context.contextId);
        this.disposedContexts.add(event.context.contextId);
      }
    });
  }

  get(context: CommandContext) {
    if (context.isPrivate) {
      const existing = this.privateStates.get(context.contextId);
      if (existing) return structuredClone(existing);
      const state = defaultNewTabState();
      this.privateStates.set(context.contextId, state);
      return structuredClone(state);
    }
    return new NewTabPreferencesRepository(this.runtime.storage.open(context.profileId)).read();
  }

  update(context: CommandContext, changes: Partial<Omit<NewTabPreferences, 'shortcuts'>>) {
    return this.commit(context, (state) => {
      if (changes.background?.kind === 'image' && !state.images.some((image) => image.id === changes.background?.value)) {
        throw new BrowserError('NOT_FOUND', '背景图片已被移除');
      }
      state.preferences = { ...state.preferences, ...changes };
    });
  }

  addShortcut(context: CommandContext, title: string, input: string) {
    const url = this.safeUrl(input);
    return this.commit(context, (state) => {
      if (state.preferences.shortcuts.length >= 48) throw new BrowserError('CONFLICT', '快捷项已达到 48 个');
      state.preferences.shortcuts.push({ id: randomUUID(), title: title.trim(), url, position: state.preferences.shortcuts.length });
    });
  }

  updateShortcut(context: CommandContext, id: string, title: string, input: string) {
    const url = this.safeUrl(input);
    return this.commit(context, (state) => {
      const shortcut = state.preferences.shortcuts.find((entry) => entry.id === id);
      if (!shortcut) throw new BrowserError('NOT_FOUND', '快捷项已不存在');
      shortcut.title = title.trim(); shortcut.url = url;
    });
  }

  removeShortcut(context: CommandContext, id: string) {
    return this.commit(context, (state) => {
      state.preferences.shortcuts = state.preferences.shortcuts.filter((entry) => entry.id !== id);
      state.preferences.shortcuts.forEach((entry, position) => { entry.position = position; });
    });
  }

  moveShortcut(context: CommandContext, id: string, index: number) {
    return this.commit(context, (state) => {
      const current = state.preferences.shortcuts.findIndex((entry) => entry.id === id);
      if (current < 0) throw new BrowserError('NOT_FOUND', '快捷项已不存在');
      const [shortcut] = state.preferences.shortcuts.splice(current, 1);
      state.preferences.shortcuts.splice(Math.min(index, state.preferences.shortcuts.length), 0, shortcut);
      state.preferences.shortcuts.forEach((entry, position) => { entry.position = position; });
    });
  }

  async importBackground(context: CommandContext) {
    if (this.get(context).images.length >= 48) throw new BrowserError('CONFLICT', '背景图片已达到 48 张，请先移除一些图片');
    const image = await chooseBackground(this.runtime.core.getNativeWindow(context.windowId));
    if (!image) return this.get(context);
    if (this.disposedContexts.has(context.contextId)) throw new BrowserError('CANCELLED', '窗口已关闭');
    return this.commit(context, (state) => {
      if (state.images.length >= 48) throw new BrowserError('CONFLICT', '背景图片已达到 48 张');
      state.images.push(image);
      state.preferences.background = { kind: 'image', value: image.id };
    });
  }

  removeBackground(context: CommandContext, id: string) {
    return this.commit(context, (state) => {
      state.images = state.images.filter((image) => image.id !== id);
      if (state.preferences.background.kind === 'image' && state.preferences.background.value === id) {
        state.preferences.background = { kind: 'gradient', value: 'dusk' };
      }
    });
  }

  dispose() {
    this.disposeEvents(); this.privateStates.clear(); this.disposedContexts.clear();
  }

  private commit(context: CommandContext, update: (state: NewTabState) => void): NewTabState {
    const state = this.get(context);
    update(state);
    state.revision++;
    if (context.isPrivate) this.privateStates.set(context.contextId, state);
    else new NewTabPreferencesRepository(this.runtime.storage.open(context.profileId)).write(state);
    this.runtime.publish('newTab.changed', state, context.isPrivate ? { contextId: context.contextId } : { profileId: context.profileId });
    return structuredClone(state);
  }

  private safeUrl(input: string) {
    let url: URL;
    try { url = new URL(input.includes('://') ? input : `https://${input}`); }
    catch { throw new BrowserError('INVALID_ARGUMENT', '请输入有效的网址'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new BrowserError('INVALID_ARGUMENT', '快捷项仅支持 HTTP 或 HTTPS');
    return url.href;
  }
}
