import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncService } from './sync-service';
export function registerSyncIpc(runtime: FeatureRuntime, service: SyncService) {
  const disposers = [
    runtime.router.handle('sync.get', (_payload, context) => service.get(context.profileId)),
    runtime.router.handle('sync.configure', (payload, context) => service.configure(context, payload)),
    runtime.router.handle('sync.createChain', (_payload, context) => service.create(context)),
    runtime.router.handle('sync.joinChain', (payload, context) => service.join(context, payload.code)),
    runtime.router.handle('sync.showCode', (_payload, context) => service.showCode(context)),
    runtime.router.handle('sync.setTypes', (payload, context) => service.setTypes(context, payload.enabledTypes)),
    runtime.router.handle('sync.run', (_payload, context) => service.run(context)),
    runtime.router.handle('sync.cancel', (_payload, context) => service.cancel(context)),
    runtime.router.handle('sync.leave', (_payload, context) => service.leave(context)),
    runtime.router.handle('sync.resolveConflict', (payload, context) => service.resolve(context, payload.id, payload.keep)),
    runtime.router.handle('sync.openRemoteTab', (payload, context) => service.openRemoteTab(context, payload.deviceId, payload.tabId)),
  ];
  return () => disposers.forEach(dispose => dispose());
}
