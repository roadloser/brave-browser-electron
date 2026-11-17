import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { shieldsMigrations } from './site-rules-repository';
import { ShieldsService } from './shields-service';
import { registerShieldsIpc } from './register-ipc';
import { registerCosmeticBridge } from './cosmetic-bridge';

export const shieldsFeature: FeatureDefinition = {
  id: 'shields',
  migrations: shieldsMigrations,
  register(runtime) {
    const service = new ShieldsService(runtime);
    const stopCommands = registerShieldsIpc(runtime, service);
    const stopCosmetics = registerCosmeticBridge(runtime, service);
    service.start();
    return { id: 'shields', dispose() { stopCommands(); stopCosmetics(); service.dispose(); } };
  },
};
