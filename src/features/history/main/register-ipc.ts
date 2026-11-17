import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { HistoryService } from './service';

export function registerHistoryIpc(runtime: FeatureRuntime, service: HistoryService) {
  const releases = [
    runtime.router.handle('history.query', (input, context) => service.query(context, input)),
    runtime.router.handle('history.remove', (input, context) => service.remove(context, input.ids)),
    runtime.router.handle('history.clear', (input, context) => service.clear(context, input)),
  ];
  return () => releases.reverse().forEach(release => release());
}
