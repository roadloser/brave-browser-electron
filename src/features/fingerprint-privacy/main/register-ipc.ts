import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { PrivacyService } from './privacy-service';

export function registerPrivacyIpc(runtime: FeatureRuntime, service: PrivacyService) {
  const releases = [
    runtime.router.handle('privacy.get', (input, context) => service.get(context, input.tabId)),
    runtime.router.handle('privacy.setDefault', (input, context) => service.setDefault(context, input.mode)),
    runtime.router.handle('privacy.setSite', (input, context) => service.setSite(context, input.origin, input.mode)),
    runtime.router.handle('privacy.resetSite', (input, context) => service.setSite(context, input.origin, null)),
  ];
  return () => releases.reverse().forEach(release => release());
}
