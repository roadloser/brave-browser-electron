import type { BookmarksState } from '../../../shared/contracts/bookmarks';
import type { CommandPayload } from '../../../shared/contracts/envelope';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { BookmarkRepository } from './repository';

export class BookmarkService {
  private readonly localListeners = new Set<(profileId: string) => void>();
  constructor(private readonly runtime: FeatureRuntime) {}

  subscribeLocal(listener: (profileId: string) => void) {
    this.localListeners.add(listener);
    return () => { this.localListeners.delete(listener); };
  }

  notifyImported(profileId: string): void {
    this.runtime.publish('bookmarks.changed', this.list(profileId), { profileId, includePrivate: true });
  }

  list(profileId: string, query?: string): BookmarksState {
    return this.repository(profileId).state(query);
  }

  create(context: CommandContext, input: CommandPayload<'bookmarks.create'>): BookmarksState {
    return this.changed(context.profileId, this.repository(context.profileId).create(input));
  }

  update(context: CommandContext, input: CommandPayload<'bookmarks.update'>): BookmarksState {
    return this.changed(context.profileId, this.repository(context.profileId).update(input));
  }

  move(context: CommandContext, input: CommandPayload<'bookmarks.move'>): BookmarksState {
    return this.changed(context.profileId, this.repository(context.profileId).move(input));
  }

  remove(context: CommandContext, id: string): BookmarksState {
    return this.changed(context.profileId, this.repository(context.profileId).remove(id));
  }

  addCurrentTab(context: CommandContext, input: CommandPayload<'bookmarks.addCurrentTab'>): BookmarksState {
    const tab = this.runtime.core.getTab(input.tabId);
    if (tab.profileId !== context.profileId || tab.contextId !== context.contextId || tab.windowId !== context.windowId) {
      throw new BrowserError('FORBIDDEN', '不能读取其他窗口或资料中的标签');
    }
    if (!tab.url || tab.url === 'about:blank') throw new BrowserError('INVALID_ARGUMENT', '当前标签没有可保存的地址');
    return this.create(context, { parentId: input.parentId, kind: 'bookmark', title: tab.title || tab.url, url: tab.url });
  }

  private repository(profileId: string): BookmarkRepository {
    return new BookmarkRepository(this.runtime.storage.open(profileId));
  }

  private changed(profileId: string, state: BookmarksState): BookmarksState {
    this.runtime.publish('bookmarks.changed', state, { profileId, includePrivate: true });
    for (const listener of this.localListeners) listener(profileId);
    return state;
  }
}
