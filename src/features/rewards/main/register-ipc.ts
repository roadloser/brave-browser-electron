import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { RewardsService } from './rewards-service';

export function registerRewardsIpc(runtime: FeatureRuntime, service: RewardsService) {
  const releases = [
    runtime.router.handle('rewards.get', (_input, context) => service.get(context)),
    runtime.router.handle('rewards.configure', (input, context) => service.configure(context, input.endpoint, input.serviceKey, input.solanaRpcUrl)),
    runtime.router.handle('rewards.register', (input, context) => service.register(context, input.geoCountry)),
    runtime.router.handle('rewards.refresh', (_input, context) => service.refresh(context)),
    runtime.router.handle('rewards.connectSelfCustody', (_input, context) => service.connectSelfCustody(context)),
    runtime.router.handle('rewards.configureAds', (input, context) => service.configureAds(context, input.nonAnonymousEndpoint, input.issuerPublicKeys)),
    runtime.router.handle('rewards.refillConfirmationTokens', (_input, context) => service.refillConfirmationTokens(context)),
    runtime.router.handle('rewards.cancel', (_input, context) => service.cancel(context)),
  ];
  return () => releases.reverse().forEach(release => release());
}
