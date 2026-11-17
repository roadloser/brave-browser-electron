import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { downloadMigrations } from './repository';
import { DownloadManager } from './download-manager';
import { registerDownloadsIpc } from './register-ipc';
export const downloadsFeature: FeatureDefinition = {
  id: 'downloads', migrations: downloadMigrations,
  register(runtime) {
    const manager = new DownloadManager(runtime);
    const disposeIpc = registerDownloadsIpc(runtime, manager);
    return { id: 'downloads', dispose: () => { disposeIpc(); manager.dispose(); } };
  },
};
