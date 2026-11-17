import { useBrowserStore } from './shell/browser-store';
import { BookmarkCurrentTabButton } from '../features/bookmarks/renderer/bookmark-current-tab-button';
import { BookmarksBar } from '../features/bookmarks/renderer/bookmarks-bar';

function useActiveTab() {
  const snapshot = useBrowserStore(state => state.snapshot);
  const window = snapshot?.windows.find(entry => entry.id === snapshot.currentWindowId);
  return window?.tabs.find(entry => entry.id === window.activeTabId);
}

export function FeatureToolbar() {
  const tab = useActiveTab();
  return <BookmarkCurrentTabButton tab={tab} />;
}

export function FeatureBookmarksBar() {
  const tab = useActiveTab();
  return <BookmarksBar tab={tab} />;
}
