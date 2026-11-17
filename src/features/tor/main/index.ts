import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { torMigrations } from './repository';
import { TorService } from './tor-service';
import { registerTorIpc } from './register-ipc';
export const torFeature: FeatureDefinition = {
  id: 'tor', migrations: torMigrations,
  register(runtime) {
    const service = new TorService(runtime);
    const disposeIpc = registerTorIpc(runtime, service);
    return { id: 'tor', dispose: async () => { disposeIpc(); await service.dispose(); } };
  },
};
