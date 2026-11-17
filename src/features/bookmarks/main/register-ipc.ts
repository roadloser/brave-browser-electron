import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BookmarkService } from './service';

export function registerBookmarkIpc(runtime: FeatureRuntime, service: BookmarkService) {
  const releases = [
    runtime.router.handle('bookmarks.list', (input, context) => service.list(context.profileId, input.query)),
    runtime.router.handle('bookmarks.create', (input, context) => service.create(context, input)),
    runtime.router.handle('bookmarks.update', (input, context) => service.update(context, input)),
    runtime.router.handle('bookmarks.move', (input, context) => service.move(context, input)),
    runtime.router.handle('bookmarks.remove', (input, context) => service.remove(context, input.id)),
    runtime.router.handle('bookmarks.addCurrentTab', (input, context) => service.addCurrentTab(context, input)),
  ];
  return () => releases.reverse().forEach(release => release());
}
