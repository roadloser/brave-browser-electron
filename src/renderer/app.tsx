import { BrowserShell } from './shell/browser-shell';
import { renderBrowserPage } from './routes';

export function App() {
  return <BrowserShell renderPage={renderBrowserPage} />;
}
