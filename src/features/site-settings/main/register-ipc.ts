import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { PermissionService } from './permission-service';
export function registerSiteSettingsIpc(runtime: FeatureRuntime, service: PermissionService) {
  const disposers = [
    runtime.router.handle('siteSettings.get', (payload, context) => service.get(context, payload.origin)),
    runtime.router.handle('siteSettings.set', (payload, context) => service.set(context, payload.origin, payload.permission, payload.decision)),
    runtime.router.handle('siteSettings.resolve', (payload, context) => service.resolve(context, payload.id, payload.allow, payload.remember)),
    runtime.router.handle('siteSettings.clearData', (payload, context) => service.clearData(context, payload)),
  ];
  return () => disposers.forEach(dispose => dispose());
}
