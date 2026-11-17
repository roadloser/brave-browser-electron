import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { BrowserCore } from '../browser-core/browser-core';
import { registerBrowserIpc } from '../browser-core/register-ipc';
import { SqliteStorageHost } from '../platform/storage/database';
import { IpcRouter } from '../ipc/router';
import { createEventPublisher } from '../ipc/event-publisher';
import { mapError } from '../ipc/error-mapper';
import { PageScriptHost } from '../platform/runtime/page-script-host';
import { SecretStore } from '../platform/credentials/secret-store';
import { NetworkPolicyCoordinator } from '../platform/network/request-policy';
import { ElectronRequestHost } from '../platform/network/electron-request-host';
import type { Dispose } from '../../shared/contracts/envelope';
import type { FeatureRegistration, FeatureRuntime } from '../../shared/module-lifecycle';
import { featureManifest } from './feature-manifest';
import { migrationManifest } from './migration-manifest';
import { SyncDataCoordinator } from './sync-data';
import { resolveUiUrl } from './ui-location';

export class AppRuntime {
  private core?: BrowserCore;
  private storage?: SqliteStorageHost;
  private router?: IpcRouter;
  private pages?: PageScriptHost;
  private features: FeatureRegistration[] = [];
  private subscriptions: Dispose[] = [];
  private disposed = false;

  async start(): Promise<void> {
    try {
      await this.initialize();
    } catch (error) {
      try { await this.dispose(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], '启动失败且资源释放未完成'); }
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    const uiUrl = resolveUiUrl();
    const storage = new SqliteStorageHost(app.getPath('userData'));
    this.storage = storage;
    let reportCoreError = (_error: unknown): void => {};
    const core = new BrowserCore({
      storage,
      uiUrl,
      preloadPath: join(app.getAppPath(), 'dist/preload/index.cjs'),
      onProfileReady: profileId => storage.migrate(profileId, migrationManifest),
      onError: error => reportCoreError(error),
    });
    this.core = core;
    const router = new IpcRouter(core, uiUrl);
    this.router = router;
    const publish = createEventPublisher(core);
    reportCoreError = error => {
      for (const profile of core.getProfiles()) {
        publish('app.error', mapError(error), { profileId: profile.id, includePrivate: true });
      }
    };
    const pages = new PageScriptHost(core);
    this.pages = pages;
    const policies = new NetworkPolicyCoordinator();
    const runtime: FeatureRuntime = {
      core, storage, router, publish, pages, syncData: new SyncDataCoordinator(),
      syncTabs: {
        snapshot: profileId => core.getSyncTabs(profileId),
        subscribe: listener => core.onEvent(event => {
          if (event.type !== 'stateChanged') return;
          const window = event.state.windows.find(entry => entry.id === event.windowId);
          if (window && !window.isPrivate && window.ready) listener(window.profileId);
        }),
      },
      secrets: new SecretStore(), requests: new ElectronRequestHost(policies),
      assets: {
        credentialPreloadPath: join(app.getAppPath(), 'dist/preload/credentials.cjs'),
        translationPreloadPath: join(app.getAppPath(), 'dist/preload/translation.cjs'),
        shieldsPreloadPath: join(app.getAppPath(), 'dist/preload/shields.cjs'),
        privacyPreloadPath: join(app.getAppPath(), 'dist/preload/privacy.cjs'),
        walletPreloadPath: join(app.getAppPath(), 'dist/preload/wallet.cjs'),
      },
    };
    for (const profile of core.getProfiles()) storage.migrate(profile.id, migrationManifest);
    this.subscriptions.push(registerBrowserIpc(runtime));
    this.subscriptions.push(core.onEvent(event => {
      if (event.type === 'sessionCreated') policies.select(core.sessionForContext(event.context), 'native-shields', 'D-003');
      if (event.type === 'stateChanged') publish('browser.state', event.state, { windowId: event.windowId });
      if (event.type === 'shortcut') publish('browser.shortcut', { action: event.action }, { windowId: event.windowId });
    }));
    for (const definition of featureManifest) this.features.push(await definition.register(runtime));
    await core.restore();
  }

  async activate(): Promise<void> {
    if (!this.core || this.disposed) return;
    const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed());
    if (windows.length === 0) await this.core.openWindow();
    else {
      const window = windows[0];
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    for (const feature of this.features.reverse()) {
      try { await feature.dispose(); } catch (error) { errors.push(error); }
    }
    this.features = [];
    for (const dispose of this.subscriptions.reverse()) {
      try { dispose(); } catch (error) { errors.push(error); }
    }
    this.subscriptions = [];
    try { this.pages?.dispose(); } catch (error) { errors.push(error); }
    try { await this.core?.dispose(); } catch (error) { errors.push(error); }
    try { this.router?.dispose(); } catch (error) { errors.push(error); }
    try { this.storage?.close(); } catch (error) { errors.push(error); }
    if (errors.length > 0) throw new AggregateError(errors, '部分浏览器资源未能正常释放');
  }
}
