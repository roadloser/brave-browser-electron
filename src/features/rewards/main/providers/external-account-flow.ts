import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { RewardsStored } from '../rewards-repository';
import { NodeRewardsSigner } from '../wallet-signer';
import { contextRewardsFetch } from '../rewards-network';
import { BrowserError } from '../../../../shared/errors';
import type { ExternalAccount, ProviderOperation, ProviderToken } from './provider-types';
import { ExternalAccountRepository } from './external-repository';
import { prepareUpholdAccount } from './uphold-account';
import { claimProvider } from './provider-claim';
import { providerBalance } from './provider-balance';

export class ExternalAccountFlow {
  private readonly signer = new NodeRewardsSigner();
  private disposed = false;
  constructor(private readonly runtime: FeatureRuntime, private readonly read: (profileId: string) => RewardsStored,
    private readonly notify: (profileId: string) => void) {}
  operation(context: BrowserContext, signal: AbortSignal): ProviderOperation {
    const rewards = this.read(context.profileId);
    return { fetch: contextRewardsFetch(this.runtime, context), signal, serviceKey: rewards.serviceKeyCipher ? this.runtime.secrets.decrypt(rewards.serviceKeyCipher) : undefined };
  }
  async connect(context: BrowserContext, account: ExternalAccount, signal: AbortSignal): Promise<void> {
    if (!account.tokenCipher) throw new BrowserError('UNAVAILABLE', '没有可恢复的收款凭据，请重新授权');
    const repository = this.repository(context.profileId); const operation = this.operation(context, signal);
    let credentials: ProviderToken = { token: this.runtime.secrets.decrypt(account.tokenCipher), address: account.address, linkingInfo: account.linkingCipher ? this.runtime.secrets.decrypt(account.linkingCipher) : undefined };
    if (account.provider === 'uphold' && !credentials.address) {
      repository.save({ ...account, status: 'preparing', error: undefined }); this.notify(context.profileId);
      credentials = await prepareUpholdAccount(credentials, operation);
      if (this.disposed) throw new BrowserError('CANCELLED', '收款服务已关闭');
      account = { ...account, address: credentials.address, displayName: credentials.displayName };
      repository.save(account);
    }
    if (signal.aborted || this.disposed) throw new BrowserError('CANCELLED', '收款账户连接已暂停');
    const rewards = this.read(context.profileId);
    if (!rewards.paymentId || !rewards.seedCipher) throw new BrowserError('UNAVAILABLE', 'Rewards钱包资料不存在');
    repository.save({ ...account, status: 'claiming', error: undefined }); this.notify(context.profileId);
    const seed = Buffer.from(this.runtime.secrets.decrypt(rewards.seedCipher), 'hex');
    let country: string;
    try { country = await claimProvider(account.provider, credentials, rewards.endpoint, rewards.paymentId, seed, this.signer, operation); }
    finally { seed.fill(0); }
    if (signal.aborted || this.disposed) throw new BrowserError('CANCELLED', '连接请求已暂停，服务结果可能已生效');
    account = { ...account, status: 'connected', country, error: undefined };
    repository.save(account); this.notify(context.profileId);
    await this.balance(context, signal);
  }
  async balance(context: BrowserContext, signal: AbortSignal): Promise<void> {
    const repository = this.repository(context.profileId); const account = repository.get();
    if (!account?.tokenCipher || account.status !== 'connected' || !account.address) throw new BrowserError('UNAVAILABLE', '请先完成收款账户连接');
    const balance = await providerBalance(account.provider, { token: this.runtime.secrets.decrypt(account.tokenCipher), address: account.address }, this.operation(context, signal));
    if (signal.aborted || this.disposed) throw new BrowserError('CANCELLED', '余额查询已取消');
    repository.save({ ...account, balance, balanceAt: Date.now(), error: undefined }); this.notify(context.profileId);
  }
  dispose(): void { this.disposed = true; }
  private repository(profileId: string) { return new ExternalAccountRepository(this.runtime.storage.open(profileId)); }
}
