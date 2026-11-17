import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { bookmarkMigrations } from './schema';
import { BookmarkService } from './service';
import { registerBookmarkIpc } from './register-ipc';

export const bookmarksFeature: FeatureDefinition = {
  id: 'bookmarks',
  migrations: bookmarkMigrations,
  register(runtime) {
    const service = new BookmarkService(runtime);
    return { id: 'bookmarks', dispose: registerBookmarkIpc(runtime, service) };
  },
};
