import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { privacyMigrations } from './privacy-repository';
import { PrivacyService } from './privacy-service';
import { registerPrivacyIpc } from './register-ipc';

export const fingerprintPrivacyFeature: FeatureDefinition = {
  id: 'fingerprint-privacy', migrations: privacyMigrations,
  register(runtime) {
    const service = new PrivacyService(runtime);
    const stopCommands = registerPrivacyIpc(runtime, service);
    service.start();
    return { id: 'fingerprint-privacy', dispose() { stopCommands(); service.dispose(); } };
  },
};
