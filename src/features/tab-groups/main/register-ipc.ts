import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { TabGroupService } from './service';

export function registerTabGroupIpc(runtime: FeatureRuntime, service: TabGroupService) {
  const releases = [
    runtime.router.handle('tabGroups.list', (_payload, context) => service.list(context)),
    runtime.router.handle('tabGroups.create', (payload, context) => service.create(context, payload)),
    runtime.router.handle('tabGroups.update', (payload, context) => service.update(context, payload)),
    runtime.router.handle('tabGroups.moveTab', (payload, context) => service.moveTab(context, payload)),
    runtime.router.handle('tabGroups.ungroup', (payload, context) => service.ungroup(context, payload.groupId)),
    runtime.router.handle('tabGroups.close', (payload, context) => service.close(context, payload.groupId)),
  ];
  return () => releases.forEach((release) => release());
}
