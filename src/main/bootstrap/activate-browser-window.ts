import { BrowserWindow } from 'electron';
import type { BrowserCorePort } from '../../shared/runtime-ports';

export async function activateBrowserWindow(core: BrowserCorePort): Promise<void> {
  const windows = BrowserWindow.getAllWindows().filter(window =>
    !window.isDestroyed() && core.getWindowForSender(window.webContents.id) !== undefined,
  );
  if (windows.length === 0) {
    await core.openWindow();
    return;
  }
  const focused = windows.find(window => window.isFocused()) ?? windows[0];
  if (focused.isMinimized()) focused.restore();
  focused.show();
  focused.focus();
}
