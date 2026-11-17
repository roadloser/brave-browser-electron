import { app, dialog } from 'electron';
import { AppRuntime } from './bootstrap/app-runtime';

app.setName('Brave Electron');
const runtime = new AppRuntime();
const hasLock = app.requestSingleInstanceLock();
let quitting = false;

if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => void runtime.activate());
  app.on('activate', () => void runtime.activate());
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void runtime.dispose().catch(error => {
      dialog.showErrorBox('退出清理未完成', error instanceof Error ? error.message : '无法完整释放浏览器资源');
    }).finally(() => app.quit());
  });
  void app.whenReady().then(() => runtime.start()).catch(error => {
    dialog.showErrorBox('Brave Electron 启动失败', error instanceof Error ? error.message : '无法启动浏览器');
    app.quit();
  });
}
