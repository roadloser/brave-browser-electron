import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { settingsMigrations } from './repository';
import { SettingsService } from './settings-service';
import { registerSettingsIpc } from './register-ipc';
import { createSettingsSyncAdapter } from './sync-adapter';

export const settingsFeature: FeatureDefinition = {
  id: 'settings', migrations: settingsMigrations,
  register(runtime) {
    const service = new SettingsService(runtime);
    const disposeIpc = registerSettingsIpc(runtime, service);
    const disposeSync = runtime.syncData.register('settings', createSettingsSyncAdapter(runtime, service));
    return { id: 'settings', dispose: () => { disposeSync(); disposeIpc(); service.dispose(); } };
  },
};
