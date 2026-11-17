import type { TabGroup } from '../../../shared/contracts/tab-groups';
import type { WindowSnapshot } from '../../../shared/contracts/browser-core';

export function normalizeGroups(groups: TabGroup[], window: WindowSnapshot): TabGroup[] {
  const order = new Map(window.tabs.map((tab, index) => [tab.id, index]));
  const valid = new Set(window.tabs.filter((tab) => !tab.pinned).map((tab) => tab.id));
  const assigned = new Set<string>();
  return groups.map((group) => {
    const tabIds = group.tabIds.filter((tabId) => {
      if (!valid.has(tabId) || assigned.has(tabId)) return false;
      assigned.add(tabId);
      return true;
    }).sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
    return { ...group, tabIds, position: tabIds.length ? order.get(tabIds[0]) ?? 0 : 0 };
  }).filter((group) => group.tabIds.length > 0).sort((left, right) => left.position - right.position);
}

export function contiguousOrder(groups: TabGroup[], window: WindowSnapshot): string[] {
  const memberships = new Map(groups.flatMap((group) => group.tabIds.map((tabId) => [tabId, group] as const)));
  const emitted = new Set<string>();
  const order: string[] = [];
  for (const tab of window.tabs) {
    const group = memberships.get(tab.id);
    if (!group) {
      order.push(tab.id);
      continue;
    }
    if (emitted.has(group.id)) continue;
    emitted.add(group.id);
    order.push(...group.tabIds);
  }
  return order;
}
