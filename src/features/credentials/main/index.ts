import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { credentialMigrations } from './credential-repository';
import { VaultService } from './vault-service';
import { registerCredentialsIpc } from './register-ipc';
import { createCredentialSyncAdapter } from './sync-adapter';
export const credentialsFeature: FeatureDefinition = {
  id: 'credentials', migrations: credentialMigrations,
  register(runtime) {
    const service = new VaultService(runtime);
    const disposeIpc = registerCredentialsIpc(runtime, service);
    const disposeSync = runtime.syncData.register('passwords', createCredentialSyncAdapter(runtime, service));
    return { id: 'credentials', dispose: () => { disposeSync(); disposeIpc(); service.dispose(); } };
  },
};
