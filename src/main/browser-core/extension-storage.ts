import { BrowserWindow, type Session } from 'electron';
import { BrowserError } from '../../shared/errors';

export async function clearExtensionStorage(browserSession: Session, extensionId: string): Promise<void> {
  const extension = browserSession.extensions.getExtension(extensionId);
  if (!extension) throw new BrowserError('NOT_FOUND', '此资料未加载指定扩展');
  if (!/^[a-p]{32}$/.test(extensionId)) throw new BrowserError('INVALID_ARGUMENT', '扩展标识无效');
  const window = new BrowserWindow({
    show: false, width: 1, height: 1,
    webPreferences: { session: browserSession, nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await window.loadURL('chrome-extension://' + extensionId + '/manifest.json');
    const result = await window.webContents.executeJavaScript(`(async () => {
      const api = globalThis.chrome;
      if (!api?.storage) return { ok: false, reason: '扩展上下文没有 chrome.storage 能力' };
      const required = ['local'];
      const present = ['local', 'sync', 'session'].filter(area => api.storage[area]);
      if (required.some(area => !api.storage[area])) return { ok: false, reason: 'chrome.storage.local 不可用' };
      for (const area of present) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('扩展存储清理超时：' + area)), 10000);
          api.storage[area].clear(() => {
            clearTimeout(timeout);
            const error = api.runtime?.lastError;
            if (error) reject(new Error(error.message)); else resolve();
          });
        });
      }
      return { ok: true, cleared: present };
    })()`, true) as { ok: boolean; reason?: string; cleared?: string[] };
    if (!result.ok) throw new BrowserError('UNAVAILABLE', result.reason ?? '扩展存储清理未完成');
    await browserSession.clearStorageData({
      origin: 'chrome-extension://' + extensionId,
      storages: ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
    });
  } finally { if (!window.isDestroyed()) window.destroy(); }
}
