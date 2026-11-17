import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { syncMigrations } from './repository';
import { BraveSyncAdapter } from './protocol/brave-sync-adapter';
import { SyncService } from './sync-service';
import { registerSyncIpc } from './register-ipc';

export const syncFeature: FeatureDefinition = {
  id: 'sync', migrations: syncMigrations,
  register(runtime) {
    const service = new SyncService(runtime, new BraveSyncAdapter());
    const disposeIpc = registerSyncIpc(runtime, service);
    return { id: 'sync', dispose: async () => { disposeIpc(); await service.dispose(); } };
  },
};
