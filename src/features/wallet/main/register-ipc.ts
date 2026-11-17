import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import type { CommandName, CommandPayload, CommandResults } from '../../../shared/contracts/envelope';
import type { WalletService } from './wallet-service';
import { withWalletNetwork } from './context-network';

export function registerWalletIpc(runtime: FeatureRuntime, service: WalletService) {
  const handle = <Name extends CommandName>(name: Name, handler: (payload: CommandPayload<Name>, context: CommandContext) => CommandResults[Name] | Promise<CommandResults[Name]>) =>
    runtime.router.handle(name, (payload, context) => withWalletNetwork(context, runtime.network, () => handler(payload, context)));
  const releases = [
    handle('wallet.get', (_payload, context) => service.get(context)),
    handle('wallet.create', (payload, context) => service.create(context, payload.password)),
    handle('wallet.import', (payload, context) => service.import(context, payload.password)),
    handle('wallet.unlock', (payload, context) => service.unlock(context, payload.password)),
    handle('wallet.lock', (_payload, context) => service.lock(context)),
    handle('wallet.backup', (payload, context) => service.backup(context, payload.password)),
    handle('wallet.addAccount', (payload, context) => service.addAccount(context, payload.chain, payload.networkId, payload.name)),
    handle('wallet.selectAccount', (payload, context) => service.selectAccount(context, payload.id)),
    handle('wallet.addNetwork', (payload, context) => service.addNetwork(context, payload)),
    handle('wallet.requestTransfer', (payload, context) => service.requestTransfer(context, payload.accountId, payload.to, payload.value)),
    handle('wallet.requestSign', (payload, context) => service.requestSign(context, payload.accountId, payload.message)),
    handle('wallet.requestDappTransaction', (payload, context) => service.requestDappTransaction(context, payload.accountId, payload.payload)),
    handle('wallet.approve', (payload, context) => service.approve(context, payload.id)),
    handle('wallet.reject', (payload, context) => service.reject(context, payload.id)),
    handle('wallet.refresh', (payload, context) => service.refresh(context, payload.accountId)),
    handle('wallet.refreshTransaction', (payload, context) => service.refreshTransaction(context, payload.id)),
    handle('wallet.revokeSite', (payload, context) => service.revokeSite(context, payload.origin)),
  ];
  return () => releases.forEach((release) => release());
}
