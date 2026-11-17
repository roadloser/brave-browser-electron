import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { extensionMigrations } from './extension-repository';
import { ExtensionManager } from './extension-manager';
import { registerExtensionsIpc } from './register-ipc';

export const extensionsFeature: FeatureDefinition = {
  id: 'extensions',
  migrations: extensionMigrations,
  async register(runtime) {
    const manager = new ExtensionManager(runtime);
    const stopCommands = registerExtensionsIpc(runtime, manager);
    await manager.start();
    return { id: 'extensions', async dispose() { stopCommands(); await manager.dispose(); } };
  },
};
