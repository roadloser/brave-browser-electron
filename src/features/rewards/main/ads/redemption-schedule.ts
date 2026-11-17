import { randomInt } from 'node:crypto';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { AdsDeliveryRepository } from './delivery-repository';
import type { AdsPaymentService } from './payment-service';

export async function redeemScheduledPayments(context: BrowserContext, paymentId: string, repository: AdsDeliveryRepository, service: AdsPaymentService): Promise<void> {
  const settings = repository.settings();
  if (!settings.nextRedemptionAt) {
    repository.configure({ ...settings, nextRedemptionAt: Date.now() + 86_400_000 * (0.5 + randomInt(0, 0x1000000) / 0x1000000) });
    return;
  }
  if (settings.nextRedemptionAt > Date.now() || service.busy(context.profileId) || !repository.payments().length || repository.redemption()?.status === 'failed') return;
  await service.redeem(context, paymentId);
}
