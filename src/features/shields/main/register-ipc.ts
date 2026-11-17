import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { ShieldsService } from './shields-service';

export function registerShieldsIpc(runtime: FeatureRuntime, service: ShieldsService) {
  const releases = [
    runtime.router.handle('shields.get', (input, context) => service.state(context, input.tabId)),
    runtime.router.handle('shields.setPolicy', (input, context) => service.setPolicy(context, input.origin, input.policy)),
    runtime.router.handle('shields.resetPolicy', (input, context) => service.setPolicy(context, input.origin)),
    runtime.router.handle('shields.rules', (_input, context) => service.rules(context)),
    runtime.router.handle('shields.updateRules', (_input, context) => service.updateRules(context)),
    runtime.router.handle('shields.cancelUpdate', (_input, context) => service.cancelUpdate(context)),
    runtime.router.handle('shields.rollbackRules', (_input, context) => service.rollbackRules(context)),
  ];
  return () => releases.reverse().forEach(release => release());
}
