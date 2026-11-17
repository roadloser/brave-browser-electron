import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { tabGroupMigrations } from './schema';
import { TabGroupService } from './service';
import { registerTabGroupIpc } from './register-ipc';

export const tabGroupsFeature: FeatureDefinition = {
  id: 'tab-groups',
  migrations: tabGroupMigrations,
  register(runtime) {
    const service = new TabGroupService(runtime);
    const releaseIpc = registerTabGroupIpc(runtime, service);
    return { id: 'tab-groups', dispose() { releaseIpc(); service.dispose(); } };
  },
};
