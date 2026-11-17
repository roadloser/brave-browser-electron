import type { VpnState } from '../../../shared/contracts/vpn';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { VpnRepository } from './repository';
import type { VpnTunnelSnapshot } from './tunnel-port';

export class VpnStateStore {
  private readonly profiles = new Map<string, VpnState>();
  constructor(private readonly runtime: FeatureRuntime, private readonly repository: VpnRepository, private readonly supported: boolean) {}
  get(profileId: string): VpnState {
    let state = this.profiles.get(profileId);
    if (!state) {
      state = { phase: 'unconfigured', summary: '尚未配置VPN', hasCredential: false, credentialValidated: false,
        regions: [], region: null, hostname: null, configurationId: null, systemStatus: 'not-installed', serviceId: null,
        canRollback: false, installationPending: false, secretStorageAvailable: this.runtime.secrets.available(), revision: 0,
        capabilities: { supported: this.supported, protocol: 'ikev2', scope: 'system', installation: 'system-confirmation', routeDns: 'unobserved', killSwitch: 'unobserved', wireguard: false, multihop: false, smartRouting: false } };
      this.profiles.set(profileId, state);
      try { this.saved(profileId); }
      catch { state.phase = 'failed'; state.summary = '无法读取加密VPN资料'; state.error = '请确认系统安全存储可用'; }
    }
    return structuredClone(this.profiles.get(profileId)!);
  }
  patch(profileId: string, patch: Partial<VpnState>): VpnState {
    const current = this.profiles.get(profileId) ?? this.get(profileId);
    const next = { ...current, ...patch, secretStorageAvailable: this.runtime.secrets.available(), revision: current.revision + 1 };
    this.profiles.set(profileId, next);
    this.runtime.publish('vpn.changed', structuredClone(next), { profileId, includePrivate: true });
    return structuredClone(next);
  }
  saved(profileId: string): VpnState {
    const value = this.repository.get(profileId);
    return this.patch(profileId, { hasCredential: !!value.credential, credentialValidated: value.validated,
      region: value.current?.region ?? null, hostname: value.current?.hostname ?? null,
      configurationId: value.current?.id ?? null, canRollback: !!value.previous });
  }
  system(profileId: string, snapshot: VpnTunnelSnapshot): VpnState {
    const phase = snapshot.status === 'connected' ? 'connected' : snapshot.status === 'connecting' ? 'connecting' : snapshot.status === 'disconnecting' ? 'disconnecting' : snapshot.status === 'not-installed' ? 'awaiting-install' : ['invalid', 'unknown'].includes(snapshot.status) ? 'failed' : 'ready';
    const summary = snapshot.status === 'connected' ? '系统报告VPN已连接，路由与DNS尚未观察' : snapshot.status === 'not-installed' ? '请在系统设置完成此版本的VPN配置安装' : snapshot.status === 'disconnected' ? 'VPN已断开' : snapshot.status === 'connecting' ? '系统正在建立VPN连接' : snapshot.status === 'disconnecting' ? '系统正在断开VPN' : '无法确认系统VPN状态';
    return this.patch(profileId, { phase, summary, systemStatus: snapshot.status, serviceId: snapshot.serviceId });
  }
}
