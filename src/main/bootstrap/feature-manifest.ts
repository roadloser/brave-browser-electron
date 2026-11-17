import type { FeatureDefinition } from '../../shared/module-lifecycle';
import { bookmarksFeature } from '../../features/bookmarks/main';
import { historyFeature } from '../../features/history/main';
import { tabGroupsFeature } from '../../features/tab-groups/main';
import { settingsFeature } from '../../features/settings/main';
import { downloadsFeature } from '../../features/downloads/main';

export const featureManifest: readonly FeatureDefinition[] = [
  settingsFeature,
  bookmarksFeature,
  historyFeature,
  tabGroupsFeature,
  downloadsFeature,
];
