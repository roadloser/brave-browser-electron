import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { settingsMigrations } from './repository';
import { SettingsService } from './settings-service';
import { registerSettingsIpc } from './register-ipc';

export const settingsFeature: FeatureDefinition = {
  id: 'settings', migrations: settingsMigrations,
  register(runtime) {
    const service = new SettingsService(runtime);
    const disposeIpc = registerSettingsIpc(runtime, service);
    return { id: 'settings', dispose: () => { disposeIpc(); service.dispose(); } };
  },
};
