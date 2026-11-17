import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SettingsService } from './settings-service';

export function registerSettingsIpc(runtime: FeatureRuntime, service: SettingsService): () => void {
  const disposers = [
    runtime.router.handle('settings.get', (_payload, context) => service.get(context.profileId)),
    runtime.router.handle('settings.update', (payload, context) => service.update(context, payload)),
    runtime.router.handle('settings.reset', (_payload, context) => service.reset(context)),
    runtime.router.handle('settings.chooseDownloadDirectory', (_payload, context) => service.chooseDownloadDirectory(context)),
  ];
  return () => disposers.forEach(dispose => dispose());
}
