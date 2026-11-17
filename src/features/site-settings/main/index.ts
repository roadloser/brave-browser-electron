import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { siteSettingsMigrations } from './site-policy-repository';
import { PermissionService } from './permission-service';
import { registerSiteSettingsIpc } from './register-ipc';
import { siteOriginMigrations } from './site-origin-repository';
import { SiteDataService } from './site-data-service';
import { registerSiteDataIpc } from './register-site-data-ipc';
export const siteSettingsFeature: FeatureDefinition = {
  id: 'site-settings', migrations: [...siteSettingsMigrations, ...siteOriginMigrations],
  register(runtime) {
    const service = new PermissionService(runtime);
    const disposeIpc = registerSiteSettingsIpc(runtime, service);
    const data = new SiteDataService(runtime, service);
    const disposeDataIpc = registerSiteDataIpc(runtime, data);
    return { id: 'site-settings', dispose: () => { disposeDataIpc(); data.dispose(); disposeIpc(); service.dispose(); } };
  },
};
