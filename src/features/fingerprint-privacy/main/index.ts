import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { privacyMigrations } from './privacy-repository';
import { PrivacyService } from './privacy-service';
import { registerPrivacyIpc } from './register-ipc';
import { registerFramePolicyBridge } from './frame-policy-bridge';
import { registerCanvasPixelBridge } from './canvas-pixel-bridge';

export const fingerprintPrivacyFeature: FeatureDefinition = {
  id: 'fingerprint-privacy', migrations: privacyMigrations,
  register(runtime) {
    const service = new PrivacyService(runtime);
    const stopCommands = registerPrivacyIpc(runtime, service);
    const stopFrames = registerFramePolicyBridge(runtime, service);
    const stopPixels = registerCanvasPixelBridge(runtime, service);
    service.start();
    return { id: 'fingerprint-privacy', dispose() { stopCommands(); stopPixels(); stopFrames(); service.dispose(); } };
  },
};
