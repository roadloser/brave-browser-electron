import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { walletMigrations } from './wallet-repository';
import { WalletService } from './wallet-service';
import { ProviderRouter } from './provider-router';
import { registerWalletIpc } from './register-ipc';

export const walletFeature: FeatureDefinition = {
  id: 'wallet', migrations: walletMigrations,
  register(runtime) {
    const service = new WalletService(runtime);
    const provider = new ProviderRouter(runtime, service);
    const releaseIpc = registerWalletIpc(runtime, service);
    return { id: 'wallet', async dispose() { releaseIpc(); provider.dispose(); await service.dispose(); } };
  },
};
