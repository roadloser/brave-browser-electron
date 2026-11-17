import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { privacyMigrations } from './privacy-repository';
import { PrivacyService } from './privacy-service';
import { registerPrivacyIpc } from './register-ipc';
import { registerFramePolicyBridge } from './frame-policy-bridge';

export const fingerprintPrivacyFeature: FeatureDefinition = {
  id: 'fingerprint-privacy', migrations: privacyMigrations,
  register(runtime) {
    const service = new PrivacyService(runtime);
    const stopCommands = registerPrivacyIpc(runtime, service);
    const stopFrames = registerFramePolicyBridge(runtime, service);
    service.start();
    return { id: 'fingerprint-privacy', dispose() { stopCommands(); stopFrames(); service.dispose(); } };
  },
};
