import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { ExtensionManager } from './extension-manager';

export function registerExtensionsIpc(runtime: FeatureRuntime, manager: ExtensionManager) {
  const releases = [
    runtime.router.handle('extensions.get', (_input, context) => manager.get(context)),
    runtime.router.handle('extensions.chooseDirectory', (_input, context) => manager.chooseDirectory(context)),
    runtime.router.handle('extensions.proposeStoreInstall', (input, context) => manager.proposeStoreInstall(context, input.extensionId)),
    runtime.router.handle('extensions.proposeUpdate', (input, context) => manager.proposeUpdate(context, input.id)),
    runtime.router.handle('extensions.confirmInstall', (input, context) => manager.confirmInstall(context, input.proposalId, input.approve)),
    runtime.router.handle('extensions.cancelPending', (_input, context) => manager.cancelPending(context)),
    runtime.router.handle('extensions.setEnabled', (input, context) => manager.setEnabled(context, input.id, input.enabled)),
    runtime.router.handle('extensions.remove', (input, context) => manager.remove(context, input.id, input.clearData)),
    runtime.router.handle('extensions.reload', (input, context) => manager.reload(context, input.id)),
    runtime.router.handle('extensions.openAction', (input, context) => manager.openAction(context, input.id, input.tabId)),
    runtime.router.handle('extensions.closeAction', (_input, context) => manager.closeAction(context)),
  ];
  return () => releases.reverse().forEach(release => release());
}
