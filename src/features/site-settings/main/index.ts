import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { siteSettingsMigrations } from './site-policy-repository';
import { PermissionService } from './permission-service';
import { registerSiteSettingsIpc } from './register-ipc';
export const siteSettingsFeature: FeatureDefinition = {
  id: 'site-settings', migrations: siteSettingsMigrations,
  register(runtime) {
    const service = new PermissionService(runtime);
    const disposeIpc = registerSiteSettingsIpc(runtime, service);
    return { id: 'site-settings', dispose: () => { disposeIpc(); service.dispose(); } };
  },
};
