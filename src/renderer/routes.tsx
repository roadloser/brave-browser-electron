import { BookmarksPage } from '../features/bookmarks/renderer/bookmarks-page';
import { HistoryPage } from '../features/history/renderer/history-page';
import { SettingsPage } from '../features/settings/renderer/settings-page';
import { DownloadsPage } from '../features/downloads/renderer/downloads-page';
import type { TabSnapshot, WindowSnapshot } from '../shared/contracts/browser-core';
import { NewTabPage } from '../features/new-tab/renderer/new-tab-page';
import { SitePermissionPanel } from '../features/site-settings/renderer/site-permission-panel';
import { CredentialsPage } from '../features/credentials/renderer/credentials-page';
import { ExtensionsPage } from '../features/extensions/renderer/extensions-page';
import { SyncSettings } from '../features/sync/renderer/sync-settings';
import { PrivacySettings } from '../features/fingerprint-privacy/renderer/privacy-settings';
import { RewardsPanel } from '../features/rewards/renderer/rewards-panel';
import { WalletPage } from '../features/wallet/renderer/wallet-page';
import { TorPanel } from '../features/tor/renderer/tor-status';

export function renderBrowserPage(url: string, context: { tab: TabSnapshot; window: WindowSnapshot }) {
  if (url === 'brave://newtab' || url === 'brave://newtab/') return <NewTabPage {...context} />;
  if (url === 'brave://settings/passwords' || url === 'brave://credentials') return <CredentialsPage />;
  if (url === 'brave://settings/sync' || url === 'brave://sync') return <SyncSettings />;
  if (url === 'brave://settings/privacy' || url === 'brave://privacy') return <PrivacySettings />;
  if (url === 'brave://rewards' || url.startsWith('brave://rewards/')) return <RewardsPanel />;
  if (url === 'brave://wallet' || url.startsWith('brave://wallet/')) return <WalletPage />;
  if (url === 'brave://tor' || url.startsWith('brave://tor/')) return <TorPanel />;
  if (url === 'brave://settings/sites' || url === 'brave://site-settings') return <SitePermissionPanel />;
  if (url === 'brave://extensions' || url.startsWith('brave://extensions/')) return <ExtensionsPage />;
  if (url === 'brave://bookmarks' || url.startsWith('brave://bookmarks/')) return <BookmarksPage />;
  if (url === 'brave://history' || url.startsWith('brave://history/')) return <HistoryPage />;
  if (url === 'brave://settings' || url.startsWith('brave://settings/')) return <SettingsPage />;
  if (url === 'brave://downloads' || url.startsWith('brave://downloads/')) return <DownloadsPage />;
  return null;
}
