import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { credentialMigrations } from './credential-repository';
import { VaultService } from './vault-service';
import { registerCredentialsIpc } from './register-ipc';
export const credentialsFeature: FeatureDefinition = {
  id: 'credentials', migrations: credentialMigrations,
  register(runtime) {
    const service = new VaultService(runtime);
    const disposeIpc = registerCredentialsIpc(runtime, service);
    return { id: 'credentials', dispose: () => { disposeIpc(); service.dispose(); } };
  },
};
