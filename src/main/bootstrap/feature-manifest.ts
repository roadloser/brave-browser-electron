import type { FeatureDefinition } from '../../shared/module-lifecycle';
import { bookmarksFeature } from '../../features/bookmarks/main';
import { historyFeature } from '../../features/history/main';
import { tabGroupsFeature } from '../../features/tab-groups/main';

export const featureManifest: readonly FeatureDefinition[] = [
  bookmarksFeature,
  historyFeature,
  tabGroupsFeature,
];
