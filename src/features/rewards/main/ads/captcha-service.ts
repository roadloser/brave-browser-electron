import { z } from 'zod';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { RewardsState } from '../../../../shared/contracts/rewards';
import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { Migration } from '../../../../shared/runtime-ports';
import type { RewardsStored } from '../rewards-repository';
import { BrowserError } from '../../../../shared/errors';
import { AdsTokenRepository } from './token-repository';
import { contextAdsFetch, adsJson } from './ads-fetch';

type CaptchaRecord = { id: string; paymentId: string; failures: number; paused: boolean; hidden: boolean };
export const captchaMigrations: readonly Migration[] = [{ id: 'rewards.captcha', version: 1,
  up(database) { database.exec('CREATE TABLE rewards_captcha(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL)'); },
}];
export class RewardsCaptchaService {
  private readonly running = new Map<string, AbortController>();
  private disposed = false;
  constructor(private readonly runtime: FeatureRuntime, private readonly readRewards: (profileId: string) => RewardsStored,
    private readonly notify: (profileId: string) => RewardsState) {}
  state(profileId: string): RewardsState['captcha'] {
    const record = this.read(profileId);
    if (!record || record.hidden) return undefined;
    return { id: record.id, url: `https://grant.rewards.brave.com/v3/captcha/${encodeURIComponent(record.paymentId)}/${encodeURIComponent(record.id)}`, failures: record.failures, paused: record.paused };
  }
  async open(context: BrowserContext): Promise<RewardsState> {
    this.regular(context); const rewards = this.readRewards(context.profileId);
    if (!rewards.paymentId) throw new BrowserError('UNAVAILABLE', '请先注册Rewards钱包');
    if (rewards.endpoint !== 'https://grant.rewards.brave.com') throw new BrowserError('UNAVAILABLE', '官方验证码需要生产Rewards grant配置；自定义服务挑战不能在官方页面恢复');
    const tokens = new AdsTokenRepository(this.runtime.storage.open(context.profileId));
    if (tokens.configuration()?.endpoint !== 'https://mywallet.ads.brave.com') throw new BrowserError('UNAVAILABLE', '官方验证码仅用于官方Ads token服务');
    let id = tokens.pending()?.captchaId;
    if (!id) {
      if (this.running.has(context.profileId)) throw new BrowserError('CONFLICT', '正在获取验证码挑战');
      const controller = new AbortController(); this.running.set(context.profileId, controller);
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await contextAdsFetch(this.runtime, context)(`https://grant.rewards.brave.com/v3/captcha/challenge/${encodeURIComponent(rewards.paymentId)}`, { signal: controller.signal });
        if (response.status === 404) { await response.body?.cancel(); throw new BrowserError('NOT_FOUND', '官方服务当前没有待完成的验证码挑战'); }
        id = z.object({ captchaID: z.string().min(1).max(256) }).parse(await adsJson(response)).captchaID;
        if (controller.signal.aborted || this.disposed) throw new BrowserError('CANCELLED', '验证码挑战查询已取消');
      } finally { clearTimeout(timer); this.running.delete(context.profileId); }
    }
    const previous = this.read(context.profileId);
    this.write(context.profileId, { id, paymentId: rewards.paymentId, failures: previous?.failures ?? 0, paused: previous?.paused ?? false, hidden: false });
    return this.notify(context.profileId);
  }
  result(context: BrowserContext, id: string, success: boolean): RewardsState {
    this.regular(context); const record = this.read(context.profileId);
    if (!record || record.id !== id || record.hidden || record.paused) throw new BrowserError('CONFLICT', '验证码挑战已失效或暂停');
    if (success) {
      this.runtime.storage.open(context.profileId).run('DELETE FROM rewards_captcha WHERE id=1');
      const tokens = new AdsTokenRepository(this.runtime.storage.open(context.profileId)); const pending = tokens.pending();
      if (pending) tokens.saveBatch({ ...pending, captchaId: undefined, error: '用户已完成挑战，请恢复原nonce批次并以服务响应确认资格' });
    } else {
      const failures = Math.min(10, record.failures + 1);
      this.write(context.profileId, { ...record, failures, paused: failures >= 10 });
    }
    return this.notify(context.profileId);
  }
  snooze(context: BrowserContext): RewardsState { this.regular(context); const record = this.read(context.profileId); if (record) this.write(context.profileId, { ...record, hidden: true }); return this.notify(context.profileId); }
  cancel(profileId: string): void { this.running.get(profileId)?.abort(); }
  dispose(): void { this.disposed = true; for (const controller of this.running.values()) controller.abort(); }
  private read(profileId: string): CaptchaRecord | null {
    const row = this.runtime.storage.open(profileId).get<{ record: string }>('SELECT record FROM rewards_captcha WHERE id=1');
    return row ? JSON.parse(row.record) as CaptchaRecord : null;
  }
  private write(profileId: string, record: CaptchaRecord): void { this.runtime.storage.open(profileId).run('INSERT INTO rewards_captcha(id,record) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', [JSON.stringify(record)]); }
  private regular(context: BrowserContext): void { if (context.isPrivate || context.kind === 'tor') throw new BrowserError('FORBIDDEN', '验证码只在普通Rewards资料中提供'); }
}
