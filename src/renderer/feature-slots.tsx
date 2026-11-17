import { useBrowserStore } from './shell/browser-store';
import { BookmarkCurrentTabButton } from '../features/bookmarks/renderer/bookmark-current-tab-button';
import { BookmarksBar } from '../features/bookmarks/renderer/bookmarks-bar';
import { PermissionNotifications } from '../features/site-settings/renderer/permission-notifications';
import { CredentialNotifications } from '../features/credentials/renderer/credential-notifications';
import { SitePermissionButton } from '../features/site-settings/renderer/site-permission-button';
import { CredentialsButton } from '../features/credentials/renderer/credentials-button';
import { PageToolsToolbar } from '../features/page-tools/renderer/page-tools-toolbar';
import { ExtensionActions } from '../features/extensions/renderer/extension-actions';
import { LeoButton } from '../features/leo/renderer/leo-button';
import { ShieldsPanel } from '../features/shields/renderer/shields-panel';
import { TalkButton } from '../features/content-services/renderer/talk-panel';
import { WalletButton } from '../features/wallet/renderer/wallet-button';
import { TorButton } from '../features/tor/renderer/tor-status';

function useActiveTab() {
  const snapshot = useBrowserStore(state => state.snapshot);
  const window = snapshot?.windows.find(entry => entry.id === snapshot.currentWindowId);
  return window?.tabs.find(entry => entry.id === window.activeTabId);
}

export function FeatureToolbar() {
  const tab = useActiveTab();
  return <>
    <SitePermissionButton tab={tab} />
    <BookmarkCurrentTabButton tab={tab} />
    {tab && <ShieldsPanel tab={tab} />}
    <CredentialsButton tab={tab} />
    <PageToolsToolbar tab={tab} />
    {tab && <ExtensionActions tab={tab} />}
    <LeoButton tab={tab} />
    <WalletButton tab={tab} />
  </>;
}

export function FeatureBookmarksBar() {
  const tab = useActiveTab();
  return <BookmarksBar tab={tab} />;
}

export function FeatureNotifications() {
  return <><PermissionNotifications /><CredentialNotifications /></>;
}

export function FeatureSidebar() {
  return <><TalkButton /><TorButton /></>;
}
