import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { DownloadManager } from './download-manager';

export function registerDownloadsIpc(runtime: FeatureRuntime, manager: DownloadManager): () => void {
  const disposers = [
    runtime.router.handle('downloads.list', (_payload, context) => manager.list(context)),
    ...(['pause', 'resume', 'cancel', 'retry', 'remove'] as const).map(action => runtime.router.handle(`downloads.${action}`, (payload, context) => manager.control(context, payload.id, action))),
    runtime.router.handle('downloads.open', (payload, context) => manager.open(context, payload.id)),
    runtime.router.handle('downloads.showInFolder', (payload, context) => manager.show(context, payload.id)),
    runtime.router.handle('downloads.clearFinished', (_payload, context) => manager.clear(context)),
  ];
  return () => disposers.forEach(dispose => dispose());
}
