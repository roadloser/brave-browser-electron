import type { AdCreative, AdPlacement, AdsCatalog, AdsDeliverySettings } from './delivery-types';
import { selectNotification } from './delivery-policy';

export class NotificationSelection {
  private readonly served = new Map<string, Map<number, Set<string>>>();
  select(profileId: string, catalog: AdsCatalog, settings: AdsDeliverySettings, history: AdPlacement[]): AdCreative | null {
    let buckets = this.served.get(profileId);
    if (!buckets) { buckets = new Map(); this.served.set(profileId, buckets); }
    return selectNotification(catalog, settings, history, buckets);
  }
  mark(profileId: string, creative: AdCreative): void {
    const buckets = this.served.get(profileId) ?? new Map<number, Set<string>>();
    const served = buckets.get(creative.priority) ?? new Set<string>();
    served.add(creative.id); buckets.set(creative.priority, served); this.served.set(profileId, buckets);
  }
}
