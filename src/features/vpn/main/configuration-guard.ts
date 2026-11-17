import { BrowserError } from '../../../shared/errors';
import type { BrowserCorePort } from '../../../shared/runtime-ports';
import type { VpnRepository } from './repository';
import type { VpnTunnelPort } from './tunnel-port';

export class VpnConfigurationGuard {
  constructor(private readonly core: BrowserCorePort, private readonly repository: VpnRepository, private readonly tunnel: VpnTunnelPort) {}
  async disconnected(profileId: string): Promise<void> {
    const record = this.repository.get(profileId);
    for (const configuration of [record.current, record.previous]) {
      if (!configuration) continue;
      const snapshot = await this.tunnel.inspect(configuration);
      if (!['not-installed', 'disconnected'].includes(snapshot.status)) throw new BrowserError('CONFLICT', '请先确认本资料当前与上一版系统VPN均已断开');
    }
  }
  async otherConnections(profileId: string, configurationId: string): Promise<void> {
    for (const profile of this.core.getProfiles()) {
      const record = this.repository.get(profile.id);
      for (const configuration of [record.current, record.previous]) {
        if (!configuration || (profile.id === profileId && configuration.id === configurationId)) continue;
        const snapshot = await this.tunnel.inspect(configuration);
        if (!['not-installed', 'disconnected'].includes(snapshot.status)) throw new BrowserError('CONFLICT', '本应用的另一个系统VPN配置未断开，不能同时连接');
      }
    }
  }
}
