import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { vpnMigrations } from './repository';
import { VpnService } from './vpn-service';
import { registerVpnIpc } from './register-ipc';

export const vpnFeature: FeatureDefinition = {
  id: 'vpn', migrations: vpnMigrations,
  async register(runtime) {
    const service = new VpnService(runtime);
    await service.initialize();
    const disposeIpc = registerVpnIpc(runtime, service);
    return { id: 'vpn', dispose: async () => { disposeIpc(); await service.dispose(); } };
  },
};
