import type { FeatureDefinition } from '../../shared/module-lifecycle';
import { bookmarksFeature } from '../../features/bookmarks/main';
import { historyFeature } from '../../features/history/main';
import { tabGroupsFeature } from '../../features/tab-groups/main';
import { settingsFeature } from '../../features/settings/main';
import { downloadsFeature } from '../../features/downloads/main';
import { siteSettingsFeature } from '../../features/site-settings/main';
import { credentialsFeature } from '../../features/credentials/main';
import { newTabFeature } from '../../features/new-tab/main';
import { pageToolsFeature } from '../../features/page-tools/main';
import { extensionsFeature } from '../../features/extensions/main';
import { leoFeature } from '../../features/leo/main';

export const featureManifest: readonly FeatureDefinition[] = [
  settingsFeature,
  bookmarksFeature,
  historyFeature,
  tabGroupsFeature,
  downloadsFeature,
  siteSettingsFeature,
  credentialsFeature,
  newTabFeature,
  pageToolsFeature,
  extensionsFeature,
  leoFeature,
];
