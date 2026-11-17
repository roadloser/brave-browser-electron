import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SiteDataService } from './site-data-service';
export function registerSiteDataIpc(runtime: FeatureRuntime, service: SiteDataService): () => void {
  const disposers = [
    runtime.router.handle('siteData.list', (payload, context) => service.list(context, payload.query)),
    runtime.router.handle('siteData.details', (payload, context) => service.details(context, payload.origin)),
    runtime.router.handle('siteData.clear', (payload, context) => service.clear(context, payload)),
    runtime.router.handle('siteData.resetPermissions', (payload, context) => service.resetPermissions(context, payload.origin)),
  ];
  return () => disposers.forEach(dispose => dispose());
}
