import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { bookmarkMigrations } from './schema';
import { BookmarkService } from './service';
import { registerBookmarkIpc } from './register-ipc';
import { createBookmarkSyncAdapter } from './sync-adapter';

export const bookmarksFeature: FeatureDefinition = {
  id: 'bookmarks',
  migrations: bookmarkMigrations,
  register(runtime) {
    const service = new BookmarkService(runtime);
    const stopCommands = registerBookmarkIpc(runtime, service);
    const stopSync = runtime.syncData.register('bookmarks', createBookmarkSyncAdapter(runtime, service));
    return { id: 'bookmarks', dispose() { stopSync(); stopCommands(); } };
  },
};
