import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { extensionMigrations } from './extension-repository';
import { ExtensionManager } from './extension-manager';
import { registerExtensionsIpc } from './register-ipc';
import { registerActionState } from './register-action-state';

export const extensionsFeature: FeatureDefinition = {
  id: 'extensions',
  migrations: extensionMigrations,
  async register(runtime) {
    const manager = new ExtensionManager(runtime);
    const stopCommands = registerExtensionsIpc(runtime, manager);
    const stopActions = registerActionState(runtime, context => manager.actionAdapter(context));
    await manager.start();
    return { id: 'extensions', async dispose() { stopActions(); stopCommands(); await manager.dispose(); } };
  },
};
