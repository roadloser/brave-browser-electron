import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { NewTabService } from './new-tab-service';
import { newTabMigrations } from './preferences-repository';

export const newTabFeature: FeatureDefinition = {
  id: 'new-tab', migrations: newTabMigrations,
  register(runtime) {
    const service = new NewTabService(runtime);
    const releases = [
      runtime.router.handle('newTab.get', (_payload, context) => service.get(context)),
      runtime.router.handle('newTab.update', (payload, context) => service.update(context, payload)),
      runtime.router.handle('newTab.addShortcut', (payload, context) => service.addShortcut(context, payload.title, payload.url)),
      runtime.router.handle('newTab.updateShortcut', (payload, context) => service.updateShortcut(context, payload.id, payload.title, payload.url)),
      runtime.router.handle('newTab.removeShortcut', (payload, context) => service.removeShortcut(context, payload.id)),
      runtime.router.handle('newTab.moveShortcut', (payload, context) => service.moveShortcut(context, payload.id, payload.index)),
      runtime.router.handle('newTab.chooseBackground', (_payload, context) => service.importBackground(context)),
      runtime.router.handle('newTab.removeBackground', (payload, context) => service.removeBackground(context, payload.id)),
    ];
    return { id: 'new-tab', dispose() { releases.forEach((release) => release()); service.dispose(); } };
  },
};
