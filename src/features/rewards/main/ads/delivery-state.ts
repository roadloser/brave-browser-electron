import type { RewardsState } from '../../../../shared/contracts/rewards';
import type { AdsDeliveryRepository } from './delivery-repository';

export function adsDeliveryState(repository: AdsDeliveryRepository, activity: { refreshing: boolean; confirming: boolean; redeeming: boolean }): NonNullable<RewardsState['adsDelivery']> {
  const settings = repository.settings(); const catalog = repository.catalog(); const confirmations = repository.confirmations(); const batch = repository.redemption();
  const failures = confirmations.filter(confirmation => confirmation.status === 'failed');
  return {
    enabled: settings.enabled, maxPerHour: settings.maxPerHour,
    catalogStatus: activity.refreshing ? 'refreshing' : settings.error ? 'failed' : catalog ? 'ready' : 'empty',
    catalogId: catalog?.id, creativeCount: catalog?.creatives.length ?? 0, lastUpdatedAt: settings.updatedAt ?? null,
    pendingConfirmations: confirmations.filter(confirmation => confirmation.status !== 'complete').length,
    paymentTokenCount: repository.payments().length,
    confirmationStatus: activity.confirming ? 'running' : failures.length ? 'failed' : 'idle',
    settlementStatus: activity.redeeming ? 'running' : batch?.status === 'pending' ? 'unknown' : batch?.status ?? 'idle',
    reason: !settings.enabled ? '通知广告已关闭' : !catalog ? '等待官方广告目录与资格数据' : catalog.expiresAt <= Date.now() ? '广告目录已过期，等待刷新' : '已接入官方通知广告；个性化分群与其他广告格式仍待接入',
    error: settings.error ?? failures.at(-1)?.error ?? batch?.error,
  };
}
