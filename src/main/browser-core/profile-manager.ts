import type { ProfileSnapshot } from '../../shared/contracts/browser-core';
import { BrowserError } from '../../shared/errors';

export class ProfileManager {
  private readonly profiles = new Map<string, ProfileSnapshot>([
    ['default', { id: 'default', name: '个人资料', isDefault: true }],
  ]);

  list(): ProfileSnapshot[] {
    return [...this.profiles.values()].map(profile => ({ ...profile }));
  }

  get(profileId = 'default'): ProfileSnapshot {
    const profile = this.profiles.get(profileId);
    if (!profile) throw new BrowserError('NOT_FOUND', '找不到此浏览器资料');
    return { ...profile };
  }
}
