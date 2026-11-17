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
    runtime.router.handle('rewards.configureAdsDelivery', (input, context) => service.adsDelivery.configure(context, input.enabled, input.maxPerHour)),
    runtime.router.handle('rewards.refreshAds', (_input, context) => service.adsDelivery.refresh(context)),
    runtime.router.handle('rewards.retryAdsConfirmations', (_input, context) => service.adsDelivery.retry(context)),
    runtime.router.handle('rewards.redeemPaymentTokens', (_input, context) => service.adsDelivery.redeem(context)),
    runtime.router.handle('rewards.connectExternal', (input, context) => service.externalAccount.connect(context, input.provider)),
    runtime.router.handle('rewards.resumeExternal', (_input, context) => service.externalAccount.resume(context)),
    runtime.router.handle('rewards.refreshExternalBalance', (_input, context) => service.externalAccount.balance(context)),
    runtime.router.handle('rewards.signOutExternal', (_input, context) => service.externalAccount.signOut(context)),
    runtime.router.handle('rewards.adsHistory', (_input, context) => service.adsDelivery.history.list(context)),
    runtime.router.handle('rewards.reactToAd', (input, context) => service.adsDelivery.history.react(context, input.placementId, input.action)),
    runtime.router.handle('rewards.cancel', (_input, context) => service.cancel(context)),
  ];
  return () => releases.reverse().forEach(release => release());
}
