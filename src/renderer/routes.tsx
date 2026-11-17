import { BookmarksPage } from '../features/bookmarks/renderer/bookmarks-page';
import { HistoryPage } from '../features/history/renderer/history-page';

export function renderBrowserPage(url: string) {
  if (url === 'brave://bookmarks' || url.startsWith('brave://bookmarks/')) return <BookmarksPage />;
  if (url === 'brave://history' || url.startsWith('brave://history/')) return <HistoryPage />;
  return null;
}
