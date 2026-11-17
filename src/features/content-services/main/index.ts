import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { contentMigrations } from './news-repository';
import { NewsService } from './news-service';
import { TalkService } from './talk-service';

export const contentServicesFeature: FeatureDefinition = {
  id: 'content-services', migrations: contentMigrations,
  register(runtime) {
    const news = new NewsService(runtime);
    const talk = new TalkService(runtime);
    const releases = [
      runtime.router.handle('news.get', (_payload, context) => news.get(context)),
      runtime.router.handle('news.enable', (payload, context) => news.enable(context, payload.enabled)),
      runtime.router.handle('news.refresh', (_payload, context) => news.refresh(context)),
      runtime.router.handle('news.cancel', (_payload, context) => news.cancel(context)),
      runtime.router.handle('news.setLocale', (payload, context) => news.setLocale(context, payload.locale)),
      runtime.router.handle('news.setPublisher', (payload, context) => news.setPublisher(context, payload.id, payload.enabled)),
      runtime.router.handle('news.setChannel', (payload, context) => news.setChannel(context, payload.id, payload.enabled)),
      runtime.router.handle('news.addFeed', (payload, context) => news.addFeed(context, payload.url)),
      runtime.router.handle('news.removeFeed', (payload, context) => news.removeFeed(context, payload.id)),
      runtime.router.handle('talk.toggle', (_payload, context) => talk.toggle(context)),
      runtime.router.handle('talk.close', (_payload, context) => talk.close(context)),
    ];
    return { id: 'content-services', dispose() { releases.forEach((release) => release()); news.dispose(); } };
  },
};
