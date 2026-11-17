import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { VpnAccountState } from '../../../../shared/contracts/vpn-account';
import type { VpnRepository } from '../repository';

export class VpnAccountStates {
  private readonly values = new Map<string, VpnAccountState>();
  constructor(private readonly runtime: FeatureRuntime, private readonly repository: VpnRepository) {}
  get(profileId: string): VpnAccountState {
    let value = this.values.get(profileId);
    if (!value) {
      const expiry = this.repository.expiration(profileId);
      const hasCredential = !!this.repository.get(profileId).credential;
      const valid = hasCredential && expiry !== null && expiry > Date.now();
      value = { phase: valid ? 'authorized' : hasCredential ? 'expired' : 'signed-out', summary: valid ? 'VPN账户已授权' : hasCredential ? '账户授权需要刷新' : '登录Brave账户并激活VPN', expiresAt: expiry, loginOpen: false, revision: 0 };
      this.values.set(profileId, value);
    }
    if (value.phase === 'authorized' && value.expiresAt !== null && value.expiresAt <= Date.now()) {
      value = { ...value, phase: 'expired', summary: '账户授权已过期，请刷新或重新登录', revision: value.revision + 1 };
      this.values.set(profileId, value);
    }
    return { ...value };
  }
  patch(profileId: string, patch: Partial<VpnAccountState>): VpnAccountState {
    const current = this.get(profileId);
    const next = { ...current, ...patch, revision: current.revision + 1 };
    this.values.set(profileId, next);
    this.runtime.publish('vpn.accountChanged', next, { profileId, includePrivate: true });
    return { ...next };
  }
}
