import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { VaultService } from './vault-service';
export function registerCredentialsIpc(runtime: FeatureRuntime, service: VaultService) {
  const disposers = [
    runtime.router.handle('credentials.list', (_payload, context) => service.list(context)),
    runtime.router.handle('credentials.save', (payload, context) => service.save(context, payload)),
    runtime.router.handle('credentials.capture', (payload, context) => service.capture(context, payload.tabId)),
    runtime.router.handle('credentials.confirm', (payload, context) => service.confirm(context, payload.candidateId, payload.save)),
    runtime.router.handle('credentials.fill', (payload, context) => service.fill(context, payload.tabId, payload.credentialId)),
    runtime.router.handle('credentials.remove', (payload, context) => service.remove(context, payload.id)),
  ];
  return () => disposers.forEach(dispose => dispose());
}
