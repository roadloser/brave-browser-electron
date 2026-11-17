import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { VpnService } from './vpn-service';

export function registerVpnIpc(runtime: FeatureRuntime, service: VpnService): () => void {
  const releases = [
    runtime.router.handle('vpn.get', (_input, context) => service.get(context.profileId)),
    runtime.router.handle('vpn.refresh', (_input, context) => service.refresh(context.profileId)),
    runtime.router.handle('vpn.loadRegions', (_input, context) => service.loadRegions(context)),
    runtime.router.handle('vpn.setCredential', (input, context) => service.setCredential(context, input)),
    runtime.router.handle('vpn.prepare', (input, context) => service.prepare(context, input.regionId)),
    runtime.router.handle('vpn.install', (_input, context) => service.install(context)),
    runtime.router.handle('vpn.connect', (_input, context) => service.connect(context)),
    runtime.router.handle('vpn.disconnect', (_input, context) => service.disconnect(context)),
    runtime.router.handle('vpn.cancel', (_input, context) => service.cancel(context)),
    runtime.router.handle('vpn.rollback', (_input, context) => service.rollback(context)),
    runtime.router.handle('vpn.forgetCredential', (_input, context) => service.forget(context)),
    runtime.router.handle('vpn.openAccount', () => service.openAccount()),
  ];
  return () => releases.forEach(release => release());
}
