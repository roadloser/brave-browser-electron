import { BrowserShell } from './shell/browser-shell';
import { renderBrowserPage } from './routes';
import { FeatureBookmarksBar, FeatureToolbar } from './feature-slots';

export function App() {
  return <BrowserShell renderPage={renderBrowserPage} toolbarSlots={<FeatureToolbar />} bookmarksBarSlot={<FeatureBookmarksBar />} />;
}
