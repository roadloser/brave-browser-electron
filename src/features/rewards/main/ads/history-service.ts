import { randomUUID } from 'node:crypto';
import type { RewardsAdHistoryItem } from '../../../../shared/contracts/rewards';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { CommandContext, FeatureRuntime } from '../../../../shared/module-lifecycle';
import { BrowserError } from '../../../../shared/errors';
import { AdsDeliveryRepository } from './delivery-repository';
import { AdReactionRepository, type AdReactionEvent } from './reaction-repository';
import type { AdsConfirmationService } from './confirmation-service';

export class AdsHistoryService {
  constructor(private readonly runtime: FeatureRuntime, private readonly confirmations: AdsConfirmationService) {}
  list(context: BrowserContext): RewardsAdHistoryItem[] {
    this.regular(context); const reactions = this.reactions(context.profileId);
    return this.repository(context.profileId).placements().filter(placement => placement.shownAt && placement.shownAt > Date.now() - 30 * 86_400_000).slice(0, 3000).map(placement => ({
      id: placement.id, title: placement.creative.title, body: placement.creative.body, targetUrl: placement.creative.targetUrl, shownAt: placement.shownAt!,
      reaction: placement.creative.advertiserId ? reactions.reaction(placement.creative.advertiserId) : 'neutral',
      flagged: reactions.flagged(placement.creative.creativeSetId), canReact: Boolean(placement.creative.advertiserId),
    }));
  }
  async react(context: CommandContext, placementId: string, action: 'like' | 'dislike' | 'flag'): Promise<RewardsAdHistoryItem[]> {
    this.regular(context); const repository = this.repository(context.profileId); const reactions = this.reactions(context.profileId);
    if (reactions.processed(context.requestId)) return this.list(context);
    const placement = repository.placements().find(item => item.id === placementId && item.shownAt && item.shownAt > Date.now() - 30 * 86_400_000);
    if (!placement) throw new BrowserError('NOT_FOUND', '此广告不属于本资料最近的真实展示历史');
    const createdAt = Date.now();
    const type = action === 'like' ? 'upvote' : action === 'dislike' ? 'downvote' : 'flag';
    const event: AdReactionEvent = { id: randomUUID(), placement: { ...placement, events: { ...placement.events, [type]: createdAt } }, type, createdAt };
    if (action === 'flag') {
      const flagged = !reactions.flagged(placement.creative.creativeSetId);
      reactions.update(context.requestId, 'flag', placement.creative.creativeSetId, String(flagged), flagged ? event : undefined);
    } else {
      const advertiserId = placement.creative.advertiserId;
      if (!advertiserId) throw new BrowserError('UNAVAILABLE', '此旧广告历史缺少广告主标识，不能改变广告主偏好');
      const requested = action === 'like' ? 'liked' : 'disliked'; const value = reactions.reaction(advertiserId) === requested ? 'neutral' : requested;
      reactions.update(context.requestId, 'advertiser', advertiserId, value, value === 'neutral' ? undefined : event);
    }
    try { await this.resume(context); }
    catch (error) { repository.configure({ ...repository.settings(), error: error instanceof Error ? error.message : '偏好已保存，广告反馈等待恢复' }); }
    return this.list(context);
  }
  async resume(context: BrowserContext): Promise<void> {
    const reactions = this.reactions(context.profileId);
    for (const event of reactions.pending()) {
      await this.confirmations.record(context, event.placement, event.type, event.id);
      reactions.queued(event.id);
    }
  }
  private repository(profileId: string) { return new AdsDeliveryRepository(this.runtime.storage.open(profileId)); }
  private reactions(profileId: string) { return new AdReactionRepository(this.runtime.storage.open(profileId)); }
  private regular(context: BrowserContext): void { if (context.isPrivate || context.kind === 'tor') throw new BrowserError('FORBIDDEN', '广告历史只在普通资料中提供'); }
}
