import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { TorService } from './tor-service';
export function registerTorIpc(runtime: FeatureRuntime, service: TorService) {
  const disposers = [
    runtime.router.handle('tor.get', (_payload, context) => service.get(context.profileId)),
    runtime.router.handle('tor.chooseComponent', (_payload, context) => service.chooseComponent(context)),
    runtime.router.handle('tor.start', (_payload, context) => service.start(context)),
    runtime.router.handle('tor.cancel', (_payload, context) => service.stop(context)),
    runtime.router.handle('tor.stop', (_payload, context) => service.stop(context)),
    runtime.router.handle('tor.newIdentity', (_payload, context) => service.newIdentity(context)),
    runtime.router.handle('tor.rollbackComponent', (_payload, context) => service.rollback(context)),
  ];
  return () => disposers.forEach(dispose => dispose());
}
