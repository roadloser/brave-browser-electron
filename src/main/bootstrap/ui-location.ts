import { app } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserError } from '../../shared/errors';

export function resolveUiUrl(): string {
  const configured = !app.isPackaged ? process.env.BRAVE_ELECTRON_UI_URL : undefined;
  if (!configured) return pathToFileURL(join(app.getAppPath(), 'dist/renderer/index.html')).href;
  const url = new URL(configured);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new BrowserError('FORBIDDEN', '管理界面开发地址必须是本机 HTTP 服务', false);
  }
  return url.href;
}
