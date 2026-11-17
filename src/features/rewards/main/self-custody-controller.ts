import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import type { RewardsProviderPort, RewardsWalletStatus } from './provider-port';
import type { RewardsStored } from './rewards-repository';
import { BrowserError } from '../../../shared/errors';
import { contextRewardsFetch } from './rewards-network';

export class SelfCustodyController {
  private readonly sessions = new Map<string, { controller: AbortController; context: CommandContext; timer?: ReturnType<typeof setTimeout>; deadline: number }>();
  constructor(private readonly runtime: FeatureRuntime, private readonly provider: RewardsProviderPort,
    private readonly read: (profileId: string) => RewardsStored,
    private readonly update: (profileId: string, status: RewardsWalletStatus) => void,
    private readonly failed: (profileId: string, message: string) => void) {}

  async connect(context: CommandContext, seed: Uint8Array): Promise<void> {
    this.cancel(context.profileId);
    const record = this.read(context.profileId);
    if (!record.paymentId || !record.availableSelfCustody?.solana) throw new BrowserError('UNAVAILABLE', '当前Rewards服务尚未确认Solana自托管收款资格，请先刷新账户状态');
    const controller = new AbortController();
    const operation = { controller, context, deadline: Date.now() + 5 * 60_000, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    this.sessions.set(context.profileId, operation);
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const challenge = await this.provider.selfCustodyChallenge({
        grantEndpoint: record.endpoint,
        serviceKey: record.serviceKeyCipher ? this.runtime.secrets.decrypt(record.serviceKeyCipher) : undefined,
        fetch: contextRewardsFetch(this.runtime, context),
      }, seed, record.paymentId, controller.signal);
      if (controller.signal.aborted) throw new BrowserError('CANCELLED', '收款连接已取消');
      await this.runtime.core.sessionForContext(context).cookies.set({
        url: 'https://rewards.brave.com', name: '__Secure-CSRF_TOKEN', value: challenge.challengeId,
        secure: true, httpOnly: true, sameSite: 'lax', path: '/', expirationDate: Math.floor(operation.deadline / 1000),
      });
      await this.runtime.core.openTab({ windowId: context.windowId, url: challenge.url, active: true });
      operation.timer = setTimeout(() => { void this.poll(context.profileId); }, 10_000);
    } catch (error) { this.cancel(context.profileId); throw error; }
    finally { clearTimeout(timeout); }
  }

  cancel(profileId: string): void {
    const operation = this.sessions.get(profileId);
    if (operation) { operation.controller.abort(); if (operation.timer) clearTimeout(operation.timer); }
    this.sessions.delete(profileId);
  }
  dispose(): void { for (const profileId of this.sessions.keys()) this.cancel(profileId); }

  private async poll(profileId: string): Promise<void> {
    const operation = this.sessions.get(profileId);
    if (!operation) return;
    if (Date.now() >= operation.deadline) { this.cancel(profileId); this.failed(profileId, '收款账户连接等待已结束，可刷新状态确认或重新连接'); return; }
    const record = this.read(profileId);
    let seed: Buffer | undefined;
    try {
      if (!record.paymentId || !record.seedCipher) throw new BrowserError('UNAVAILABLE', 'Rewards钱包资料不完整');
      seed = Buffer.from(this.runtime.secrets.decrypt(record.seedCipher), 'hex');
      const timeout = setTimeout(() => operation.controller.abort(), 20_000);
      let status: RewardsWalletStatus;
      try {
        status = await this.provider.wallet({
          grantEndpoint: record.endpoint, serviceKey: record.serviceKeyCipher ? this.runtime.secrets.decrypt(record.serviceKeyCipher) : undefined,
          fetch: contextRewardsFetch(this.runtime, operation.context),
        }, seed, record.paymentId, operation.controller.signal);
      } finally { clearTimeout(timeout); }
      if (operation.controller.signal.aborted || this.sessions.get(profileId) !== operation) return;
      this.update(profileId, status);
      if (status.linked) { this.cancel(profileId); return; }
      operation.timer = setTimeout(() => { void this.poll(profileId); }, 10_000);
    } catch (error) {
      if (this.sessions.get(profileId) === operation) {
        this.cancel(profileId); this.failed(profileId, error instanceof Error ? error.message : '收款连接状态查询失败');
      }
    } finally { seed?.fill(0); }
  }
}
