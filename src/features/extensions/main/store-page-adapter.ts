import { dialog } from 'electron';
import { installChromeWebStore } from 'electron-chrome-web-store';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { profilePath } from '../../../main/platform/storage/profile-paths';
import { join } from 'node:path';
import { fingerprintDirectory, manifestPermissions, readManifest } from './manifest';
import { ExtensionRepository } from './extension-repository';

export class ChromeStorePageAdapter {
  private readonly releases: (() => void)[] = [];
  private readonly expected = new Set<string>();
  private disposed = false;

  constructor(private readonly runtime: FeatureRuntime, private readonly context: BrowserContext,
    private readonly changed: () => void) {}

  async install(): Promise<void> {
    const session = this.runtime.core.sessionForContext(this.context);
    const loaded = (_event: Electron.Event, extension: Electron.Extension) => {
      if (!this.expected.delete(extension.id) || this.disposed) return;
      void this.record(extension).catch(() => {
        session.extensions.removeExtension(extension.id);
        this.runtime.publish('app.error', { code: 'STORAGE_FAILED', message: '商店扩展已下载但未能保存安装状态，已停用；可在扩展管理器重试', recoverable: true }, { profileId: this.context.profileId });
      });
    };
    session.extensions.on('extension-loaded', loaded);
    this.releases.push(() => session.extensions.removeListener('extension-loaded', loaded));
    await installChromeWebStore({
      session, extensionsPath: join(profilePath(this.context.profileId), 'extensions', 'web-store'),
      loadExtensions: false, autoUpdate: false, minimumManifestVersion: 2,
      beforeInstall: async details => {
        if (this.disposed) return { action: 'deny' };
        let source: URL;
        try { source = new URL(details.frame.url); } catch { return { action: 'deny' }; }
        if (source.protocol !== 'https:' || !['chromewebstore.google.com', 'chrome.google.com'].includes(source.hostname)) return { action: 'deny' };
        if (!/^[a-p]{32}$/.test(details.id)) return { action: 'deny' };
        const repository = new ExtensionRepository(this.runtime.storage.open(this.context.profileId));
        if (repository.get(details.id)) {
          await dialog.showMessageBox({ type: 'info', message: '此扩展已安装', detail: '请在扩展管理器中检查更新，以保留当前版本和回滚记录。' });
          return { action: 'deny' };
        }
        const permissions = [...(details.manifest.permissions ?? []), ...(details.manifest.host_permissions ?? [])].filter(value => typeof value === 'string');
        const result = await dialog.showMessageBox({
          type: 'question', title: '安装Chrome商店扩展',
          message: `添加“${details.localizedName}”？`,
          detail: `版本 ${details.manifest.version}\n\n此扩展请求：\n${permissions.join('\n') || '没有其他权限'}\n\n扩展网络拦截在当前Shields模式下不生效。`,
          buttons: ['取消', '添加扩展'], defaultId: 0, cancelId: 0, noLink: true,
        });
        if (result.response !== 1 || this.disposed) return { action: 'deny' };
        this.expected.add(details.id);
        return { action: 'allow' };
      },
    });
    const preload = session.getPreloadScripts().find(script => script.id === 'electron-chrome-web-store');
    if (preload) this.releases.push(() => session.unregisterPreloadScript(preload.id));
  }

  dispose(): void {
    this.disposed = true; this.expected.clear();
    this.releases.reverse().forEach(release => release());
  }

  private async record(extension: Electron.Extension) {
    const manifest = await readManifest(extension.path);
    const hash = await fingerprintDirectory(extension.path);
    if (this.disposed) return;
    const repository = new ExtensionRepository(this.runtime.storage.open(this.context.profileId));
    repository.save({
      id: extension.id, name: manifest.name, version: manifest.version, description: manifest.description ?? '',
      enabled: true, path: extension.path, ...manifestPermissions(manifest), status: 'loaded',
      hasAction: Boolean(manifest.action || manifest.browser_action), source: 'web-store', hash, optionalGrants: [],
    });
    this.changed();
  }
}
