import { BookmarksPage } from '../features/bookmarks/renderer/bookmarks-page';
import { HistoryPage } from '../features/history/renderer/history-page';
import { SettingsPage } from '../features/settings/renderer/settings-page';
import { DownloadsPage } from '../features/downloads/renderer/downloads-page';

export function renderBrowserPage(url: string) {
  if (url === 'brave://bookmarks' || url.startsWith('brave://bookmarks/')) return <BookmarksPage />;
  if (url === 'brave://history' || url.startsWith('brave://history/')) return <HistoryPage />;
  if (url === 'brave://settings' || url.startsWith('brave://settings/')) return <SettingsPage />;
  if (url === 'brave://downloads' || url.startsWith('brave://downloads/')) return <DownloadsPage />;
  return null;
}
