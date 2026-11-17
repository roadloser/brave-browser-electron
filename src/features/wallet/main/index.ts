import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { walletMigrations } from './wallet-repository';
import { WalletService } from './wallet-service';
import { ProviderRouter } from './provider-router';

export const walletFeature: FeatureDefinition = {
  id: 'wallet', migrations: walletMigrations,
  register(runtime) {
    const service = new WalletService(runtime);
    const provider = new ProviderRouter(runtime, service);
    const releases = [
      runtime.router.handle('wallet.get', (_payload, context) => service.get(context)),
      runtime.router.handle('wallet.create', (payload, context) => service.create(context, payload.password)),
      runtime.router.handle('wallet.import', (payload, context) => service.import(context, payload.password)),
      runtime.router.handle('wallet.unlock', (payload, context) => service.unlock(context, payload.password)),
      runtime.router.handle('wallet.lock', (_payload, context) => service.lock(context)),
      runtime.router.handle('wallet.backup', (payload, context) => service.backup(context, payload.password)),
      runtime.router.handle('wallet.addAccount', (payload, context) => service.addAccount(context, payload.chain, payload.networkId, payload.name)),
      runtime.router.handle('wallet.selectAccount', (payload, context) => service.selectAccount(context, payload.id)),
      runtime.router.handle('wallet.addNetwork', (payload, context) => service.addNetwork(context, payload)),
      runtime.router.handle('wallet.requestTransfer', (payload, context) => service.requestTransfer(context, payload.accountId, payload.to, payload.value)),
      runtime.router.handle('wallet.requestSign', (payload, context) => service.requestSign(context, payload.accountId, payload.message)),
      runtime.router.handle('wallet.requestDappTransaction', (payload, context) => service.requestDappTransaction(context, payload.accountId, payload.payload)),
      runtime.router.handle('wallet.approve', (payload, context) => service.approve(context, payload.id)),
      runtime.router.handle('wallet.reject', (payload, context) => service.reject(context, payload.id)),
      runtime.router.handle('wallet.refresh', (payload, context) => service.refresh(context, payload.accountId)),
      runtime.router.handle('wallet.refreshTransaction', (payload, context) => service.refreshTransaction(context, payload.id)),
      runtime.router.handle('wallet.revokeSite', (payload, context) => service.revokeSite(context, payload.origin)),
    ];
    return { id: 'wallet', async dispose() { releases.forEach((release) => release()); provider.dispose(); await service.dispose(); } };
  },
};
