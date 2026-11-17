import type { CommandContext } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import type { WalletStateStore } from './wallet-state';
import type { ChainRegistry } from './chain-registry';
import { formatAmount } from './chains/network-client';

export class AccountDiscovery {
  private readonly operations = new Map<string, AbortController>();
  constructor(private readonly store: WalletStateStore, private readonly chains: ChainRegistry, private readonly publish: (context: CommandContext) => void) {}

  async refresh(context: CommandContext, accountId: string) {
    const session = this.store.get(context);
    const account = session.document.accounts.find((entry) => entry.id === accountId);
    if (!account) throw new BrowserError('NOT_FOUND', '账户不存在');
    if (account.chain !== 'bitcoin') return null;
    const adapter = this.chains.get(account.chain);
    const network = session.document.networks.find((entry) => entry.id === account.networkId)!;
    const operationKey = `${this.store.key(context)}:${accountId}`;
    this.operations.get(operationKey)?.abort();
    const controller = new AbortController();
    this.operations.set(operationKey, controller);
    let publicAccount = session.document.bitcoinAccounts[accountId];
    try {
      if (!publicAccount) {
        if (!adapter.initializeDiscovery) throw new BrowserError('UNAVAILABLE', 'Bitcoin 地址发现未接入');
        publicAccount = await session.keyring.use((mnemonic) => adapter.initializeDiscovery!({ mnemonic, index: account.index }, network));
        this.store.update(context, (document) => { document.bitcoinAccounts[accountId] = publicAccount!; });
      }
      this.store.update(context, (document) => {
        const target = document.accounts.find((entry) => entry.id === accountId)!;
        target.discovery = { status: 'scanning', scannedAt: publicAccount!.lastScannedAt ?? undefined };
      });
      this.publish(context);
      if (!adapter.discover) throw new BrowserError('UNAVAILABLE', 'Bitcoin 地址发现未接入');
      const result = await adapter.discover(account, network, publicAccount, controller.signal);
      if (controller.signal.aborted || !this.store.exists(context) || this.operations.get(operationKey) !== controller) throw new BrowserError('CANCELLED', '地址发现已取消');
      this.store.update(context, (document) => {
        document.bitcoinAccounts[accountId] = result.state;
        const target = document.accounts.find((entry) => entry.id === accountId)!;
        target.address = result.receiveAddress;
        target.receiveIndex = result.state.nextReceiveIndex;
        target.changeIndex = result.state.nextChangeIndex;
        target.discovery = { status: 'ready', scannedAt: result.state.lastScannedAt ?? undefined };
      });
      session.balances[accountId] = { value: result.balance, formatted: `${formatAmount(result.balance, network.decimals)} ${network.symbol}`, updatedAt: Date.now() };
      this.publish(context);
      return result;
    } catch (error) {
      if (this.store.exists(context) && this.operations.get(operationKey) === controller) {
        this.store.update(context, (document) => {
          const target = document.accounts.find((entry) => entry.id === accountId);
          if (target) target.discovery = { status: controller.signal.aborted ? 'idle' : 'failed',
            scannedAt: publicAccount?.lastScannedAt ?? undefined, error: error instanceof Error ? error.message : '地址发现失败' };
        });
        this.publish(context);
      }
      throw error;
    } finally {
      if (this.operations.get(operationKey) === controller) this.operations.delete(operationKey);
    }
  }
  cancelContext(context: CommandContext) {
    const prefix = this.store.key(context) + ':';
    for (const [key, controller] of this.operations) if (key.startsWith(prefix)) controller.abort();
  }
  dispose() { this.operations.forEach((controller) => controller.abort()); this.operations.clear(); }
}
