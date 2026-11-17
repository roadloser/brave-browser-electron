import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { rewardsMigrations } from './rewards-repository';
import { RewardsService } from './rewards-service';
import { registerRewardsIpc } from './register-ipc';
import { adsTokenMigrations } from './ads/token-repository';

export const rewardsFeature: FeatureDefinition = {
  id: 'rewards', migrations: [...rewardsMigrations, ...adsTokenMigrations],
  register(runtime) {
    const service = new RewardsService(runtime);
    const stopCommands = registerRewardsIpc(runtime, service);
    service.start();
    return { id: 'rewards', dispose() { stopCommands(); service.dispose(); } };
  },
};
