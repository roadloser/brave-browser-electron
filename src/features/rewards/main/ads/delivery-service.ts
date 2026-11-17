import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { RewardsState } from '../../../../shared/contracts/rewards';
import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import { BrowserError } from '../../../../shared/errors';
import type { RewardsStored } from '../rewards-repository';
import type { AdEventType, AdPlacement } from './delivery-types';
import { AdsDeliveryRepository } from './delivery-repository';
import { AdsTokenRepository } from './token-repository';
import { RistrettoWasmAdapter } from './ristretto-adapter';
import { BraveAdsConfirmationProvider } from './confirmation-provider';
import { AdsConfirmationService } from './confirmation-service';
import { AdsPaymentService } from './payment-service';
import { contextAdsFetch } from './ads-fetch';
import { fetchAdsResources } from './catalog-provider';
import { NotificationSelection } from './notification-selection';
import { redeemScheduledPayments } from './redemption-schedule';
import { ElectronAdsNotificationAdapter } from './notification-adapter';
import { adsDeliveryState } from './delivery-state';
import { AdsHistoryService } from './history-service';
import { AdReactionRepository } from './reaction-repository';

export class AdsDeliveryService {
  private readonly refreshing = new Map<string, AbortController>();
  private readonly notifications = new Map<string, () => void>();
  private readonly confirmations: AdsConfirmationService;
  private readonly payments: AdsPaymentService;
  private readonly notification: ElectronAdsNotificationAdapter;
  private readonly selection = new NotificationSelection();
  private timer?: ReturnType<typeof setInterval>;
  private release?: () => void;
  private disposed = false;
  private ticking = false;
  readonly history: AdsHistoryService;
  constructor(private readonly runtime: FeatureRuntime, private readonly rewards: (profileId: string) => RewardsStored,
    private readonly notify: (profileId: string) => RewardsState, private readonly refill: (context: BrowserContext) => Promise<RewardsState>, private readonly cancelRefill: (profileId: string) => void) {
    const crypto = new RistrettoWasmAdapter(); const provider = new BraveAdsConfirmationProvider();
    this.confirmations = new AdsConfirmationService(runtime, crypto, provider, profileId => { if (!this.disposed) this.notify(profileId); });
    this.payments = new AdsPaymentService(runtime, crypto, provider, profileId => { if (!this.disposed) this.notify(profileId); });
    this.notification = new ElectronAdsNotificationAdapter(runtime);
    this.history = new AdsHistoryService(runtime, this.confirmations);
  }
  start(): void {
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
    this.release = this.runtime.core.onEvent(event => { if (event.type === 'contextDisposed' && !event.context.isPrivate) this.cancel(event.context.profileId); });
  }
  state(profileId: string) { return adsDeliveryState(this.repository(profileId), { refreshing: this.refreshing.has(profileId), confirming: this.confirmations.busy(profileId), redeeming: this.payments.busy(profileId) }); }
  configure(context: BrowserContext, enabled: boolean, maxPerHour: number): RewardsState {
    this.regular(context);
    if (!Number.isInteger(maxPerHour) || maxPerHour < 1 || maxPerHour > 10) throw new BrowserError('INVALID_ARGUMENT', '每小时通知广告上限无效');
    const repository = this.repository(context.profileId);
    repository.configure({ ...repository.settings(), enabled, maxPerHour });
    if (!enabled) this.cancel(context.profileId);
    return this.notify(context.profileId);
  }
  async refresh(context: BrowserContext): Promise<RewardsState> {
    this.regular(context);
    if (this.refreshing.has(context.profileId)) throw new BrowserError('CONFLICT', '广告资源正在刷新');
    const controller = new AbortController(); this.refreshing.set(context.profileId, controller);
    const timer = setTimeout(() => controller.abort(), 45_000); const repository = this.repository(context.profileId);
    this.notify(context.profileId);
    try {
      const resources = await fetchAdsResources(contextAdsFetch(this.runtime, context), controller.signal);
      if (controller.signal.aborted || this.disposed) throw new BrowserError('CANCELLED', '广告目录刷新已取消');
      repository.resources(resources.catalog, resources.issuers, resources.country, resources.subdivision);
      const tokens = new AdsTokenRepository(this.runtime.storage.open(context.profileId));
      const configuration = tokens.configuration();
      if (!configuration || configuration.endpoint === 'https://mywallet.ads.brave.com') tokens.configure({ endpoint: 'https://mywallet.ads.brave.com', issuerPublicKeys: resources.issuers.confirmations });
    } catch (error) {
      if (!this.disposed) repository.configure({ ...repository.settings(), error: controller.signal.aborted ? '广告目录刷新已取消或超时，保留上次目录' : error instanceof Error ? error.message : '广告目录刷新失败' });
    } finally { clearTimeout(timer); this.refreshing.delete(context.profileId); }
    if (this.disposed) throw new BrowserError('CANCELLED', '广告服务已关闭');
    return this.notify(context.profileId);
  }
  async retry(context: BrowserContext): Promise<RewardsState> {
    this.regular(context); await this.recoverEvents(context); await this.history.resume(context); await this.confirmations.resume(context, true); return this.notify(context.profileId);
  }
  async redeem(context: BrowserContext): Promise<RewardsState> {
    this.regular(context); const paymentId = this.rewards(context.profileId).paymentId;
    if (!paymentId) throw new BrowserError('UNAVAILABLE', 'Rewards钱包未注册');
    await this.payments.redeem(context, paymentId); return this.notify(context.profileId);
  }
  cancel(profileId: string): void {
    this.cancelRefill(profileId);
    this.refreshing.get(profileId)?.abort(); this.confirmations.cancel(profileId); this.payments.cancel(profileId);
    this.notifications.get(profileId)?.(); this.notifications.delete(profileId);
  }
  dispose(): void {
    this.disposed = true; clearInterval(this.timer); this.release?.();
    for (const controller of this.refreshing.values()) controller.abort();
    for (const close of this.notifications.values()) close();
    this.notifications.clear(); this.confirmations.dispose(); this.payments.dispose();
  }
  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const context of this.runtime.core.getContexts().filter(item => !item.isPrivate && item.kind !== 'tor')) {
        if (this.disposed) return;
        try { await this.serve(context); } catch (error) { if (!this.disposed) this.error(context.profileId, error); }
      }
    } finally { this.ticking = false; }
  }
  private async serve(context: BrowserContext): Promise<void> {
    const repository = this.repository(context.profileId); const settings = repository.settings();
    if (!settings.enabled || !this.rewards(context.profileId).paymentId || !this.runtime.secrets.available()) return;
    if (!repository.catalog() || repository.catalog()!.expiresAt <= Date.now() || !repository.issuers() || repository.issuers()!.expiresAt <= Date.now()) await this.refresh(context);
    if (this.disposed || !repository.settings().enabled || this.refreshing.has(context.profileId)) return;
    await this.recoverEvents(context); await this.confirmations.resume(context);
    await this.history.resume(context);
    await redeemScheduledPayments(context, this.rewards(context.profileId).paymentId!, repository, this.payments);
    if (this.notifications.has(context.profileId)) return;
    const windowId = this.notification.findWindow(context);
    if (!windowId || !this.notification.available(windowId)) return;
    const tokens = new AdsTokenRepository(this.runtime.storage.open(context.profileId));
    if (tokens.count() < 3 && tokens.configuration()?.endpoint === 'https://mywallet.ads.brave.com') await this.refill(context);
    if (tokens.count() < 3 || this.disposed || !repository.settings().enabled) return;
    const catalog = repository.catalog(); if (!catalog) return;
    const reactions = new AdReactionRepository(this.runtime.storage.open(context.profileId));
    const creative = this.selection.select(context.profileId, { ...catalog, creatives: catalog.creatives.filter(candidate => !reactions.excluded(candidate)) }, repository.settings(), repository.placements());
    if (!creative) return;
    const placement: AdPlacement = { id: randomUUID(), windowId, creative, catalogId: catalog.id, country: repository.settings().country!, createdAt: Date.now() };
    repository.place(placement);
    const close = this.notification.show(placement, type => { void this.event(context, placement, type).catch(error => { if (!this.disposed) this.error(context.profileId, error); }); }, message => { this.notifications.delete(context.profileId); if (!this.disposed) this.error(context.profileId, new Error(message)); });
    this.notifications.set(context.profileId, close);
  }
  private async event(context: BrowserContext, placement: AdPlacement, type: AdEventType): Promise<void> {
    if (this.disposed || !this.repository(context.profileId).settings().enabled) return;
    if (placement.events?.[type]) return;
    if (type !== 'view' && !placement.shownAt) return;
    placement.events = { ...placement.events, [type]: Date.now() };
    if (type === 'view') { placement.shownAt = Date.now(); this.selection.mark(context.profileId, placement.creative); }
    this.repository(context.profileId).place(placement);
    if (type !== 'view') this.notifications.delete(context.profileId);
    if (type === 'click') {
      const windowId = this.notification.findWindow(context) ?? placement.windowId;
      await this.runtime.core.openTab({ windowId, url: placement.creative.targetUrl, active: true });
    }
    await this.confirmations.record(context, placement, type);
  }
  private async recoverEvents(context: BrowserContext): Promise<void> {
    for (const placement of this.repository(context.profileId).placements()) for (const type of Object.keys(placement.events ?? {}) as AdEventType[]) {
      if (!this.repository(context.profileId).confirmation(placement.id, type)) await this.confirmations.record(context, placement, type);
    }
  }
  private error(profileId: string, error: unknown): void {
    const repository = this.repository(profileId); repository.configure({ ...repository.settings(), error: error instanceof Error ? error.message : '通知广告失败' }); this.notify(profileId);
  }
  private repository(profileId: string) { return new AdsDeliveryRepository(this.runtime.storage.open(profileId)); }
  private regular(context: BrowserContext): void { if (context.isPrivate || context.kind === 'tor') throw new BrowserError('FORBIDDEN', 'Rewards仅在普通窗口运行'); }
}
