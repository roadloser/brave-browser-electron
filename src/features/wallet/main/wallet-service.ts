import { randomUUID } from 'node:crypto';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import type { WalletChain, WalletNetwork, WalletState } from '../../../shared/contracts/wallet';
import { BrowserError } from '../../../shared/errors';
import { ChainRegistry } from './chain-registry';
import { WalletStateStore } from './wallet-state';
import { VaultCommands } from './vault-commands';
import { TransactionController } from './transaction-controller';
import { formatAmount, safeNetworkUrl } from './chains/network-client';
import { AccountDiscovery } from './account-discovery';

export class WalletService {
  readonly chains = new ChainRegistry();
  readonly store: WalletStateStore;
  readonly transactions: TransactionController;
  private readonly discovery: AccountDiscovery;
  private readonly vault: VaultCommands;
  private readonly release: () => void;
  private readonly settlements = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly runtime: FeatureRuntime) {
    this.store = new WalletStateStore(runtime, (context) => this.onLock(context));
    this.vault = new VaultCommands(runtime, this.store);
    this.discovery = new AccountDiscovery(this.store, this.chains, (context) => this.publish(context));
    this.transactions = new TransactionController(this.store, this.chains, (context) => this.publish(context), (context, accountId) => this.discovery.refresh(context, accountId));
    this.release = runtime.core.onEvent((event) => {
      if (event.type === 'contextDisposed') {
        const context: CommandContext = { ...event.context, windowId: '', requestId: '' };
        this.discovery.cancelContext(context);
        if (this.store.exists(context)) this.onLock(context);
        this.store.close(context);
      }
      if (event.type === 'navigationCommitted' || event.type === 'tabClosed') {
        const target = event.type === 'navigationCommitted' ? event.visit : event;
        const context: CommandContext = event.type === 'navigationCommitted' ?
          { ...event.visit, requestId: '' } : { ...event.context, windowId: event.windowId, requestId: '' };
        if (!this.store.exists(context)) return;
        const requests = this.store.get(context).document.requests.filter((request) => request.tabId === target.tabId && request.status === 'pending');
        for (const request of requests) this.reject(context, request.id);
      }
    });
  }

  get(context: CommandContext): WalletState {
    const session = this.store.get(context);
    const document = session.document;
    return {
      initialized: Boolean(document.vault), locked: !session.keyring.unlocked,
      accounts: structuredClone(document.accounts), networks: structuredClone(document.networks),
      selectedAccountId: document.selectedAccountId, capabilities: this.chains.capabilities(),
      requests: structuredClone(document.requests), transactions: structuredClone(document.transactions),
      balances: structuredClone(session.balances), revision: document.revision,
    };
  }
  async create(context: CommandContext, password: string) {
    return this.store.serial(context, async () => {
      await this.vault.create(context, password); this.publish(context); return this.get(context);
    });
  }
  async import(context: CommandContext, password: string) {
    return this.store.serial(context, async () => {
      await this.vault.import(context, password); this.publish(context); return this.get(context);
    });
  }
  async unlock(context: CommandContext, password: string) {
    return this.store.serial(context, async () => {
      await this.vault.unlock(context, password); this.publish(context); return this.get(context);
    });
  }
  lock(context: CommandContext) { this.store.get(context).keyring.lock(); return this.get(context); }
  backup(context: CommandContext, password: string) { return this.store.serial(context, () => this.vault.backup(context, password)); }

  async addAccount(context: CommandContext, chain: WalletChain, networkId: string, name: string) {
    return this.store.serial(context, async () => {
      const session = this.store.get(context);
      const network = session.document.networks.find((entry) => entry.id === networkId && entry.chain === chain);
      if (!network) throw new BrowserError('NOT_FOUND', '链网络不存在');
      const adapter = this.chains.get(chain);
      const index = Math.max(-1, ...session.document.accounts.filter((account) => account.chain === chain && account.networkId === networkId).map((account) => account.index)) + 1;
      const address = await session.keyring.use((mnemonic) => adapter.derive({ mnemonic, index }, network));
      if (!session.keyring.unlocked || !this.store.exists(context)) throw new BrowserError('CANCELLED', '钱包已锁定或资料已关闭');
      const id = randomUUID();
      this.store.update(context, (document) => {
        document.accounts.push({ id, chain, networkId, name, address, index });
        document.selectedAccountId = id;
      });
      this.publish(context); return this.get(context);
    });
  }
  selectAccount(context: CommandContext, id: string) {
    this.store.update(context, (document) => {
      if (!document.accounts.some((account) => account.id === id)) throw new BrowserError('NOT_FOUND', '账户不存在');
      document.selectedAccountId = id;
    });
    this.publish(context); return this.get(context);
  }
  addNetwork(context: CommandContext, network: WalletNetwork) {
    safeNetworkUrl(network.rpcUrl);
    this.store.update(context, (document) => {
      if (document.networks.some((entry) => entry.id === network.id)) throw new BrowserError('CONFLICT', '网络ID已存在，请使用新的标识');
      document.networks.push(network);
    });
    this.publish(context); return this.get(context);
  }
  async requestTransfer(context: CommandContext, accountId: string, to: string, value: string) {
    await this.store.serial(context, () => this.transactions.transfer(context, accountId, to, value));
    return this.get(context);
  }
  requestSign(context: CommandContext, accountId: string, message: string) {
    this.transactions.message(context, accountId, message); return this.get(context);
  }
  async requestDappTransaction(context: CommandContext, accountId: string, payload: unknown) {
    await this.store.serial(context, () => this.transactions.dapp(context, accountId, payload));
    return this.get(context);
  }
  async approve(context: CommandContext, id: string) {
    try {
      const result = await this.store.serial(context, () => this.transactions.approve(context, id));
      this.settle(id, result); return this.get(context);
    } catch (error) { this.settle(id, undefined, error instanceof Error ? error : new Error('签名失败')); throw error; }
  }
  reject(context: CommandContext, id: string) {
    this.transactions.reject(context, id); this.settle(id, undefined, new BrowserError('CANCELLED', '用户拒绝或页面已改变'));
    return this.get(context);
  }
  async refresh(context: CommandContext, accountId?: string) {
    const session = this.store.get(context);
    for (const account of session.document.accounts.filter((entry) => !accountId || entry.id === accountId)) {
      const network = session.document.networks.find((entry) => entry.id === account.networkId)!;
      try {
        if (account.chain === 'bitcoin') {
          await this.discovery.refresh(context, account.id);
          continue;
        }
        const value = await this.chains.get(account.chain).balance(account, network);
        if (!this.store.exists(context)) throw new BrowserError('CANCELLED', '资料已关闭');
        session.balances[account.id] = { value, formatted: `${formatAmount(value, network.decimals)} ${network.symbol}`, updatedAt: Date.now() };
      } catch (error) {
        session.balances[account.id] = { ...(session.balances[account.id] ?? { value: '0', formatted: '未知', updatedAt: 0 }), error: error instanceof Error ? error.message : '余额读取失败' };
      }
    }
    for (const transaction of session.document.transactions.filter((entry) => entry.hash && ['pending', 'unknown'].includes(entry.status))) {
      const network = session.document.networks.find((entry) => entry.id === transaction.networkId)!;
      try {
        const status = await this.chains.get(transaction.chain).status(network, transaction.hash!);
        if (this.store.exists(context)) this.store.update(context, (document) => {
          const current = document.transactions.find((entry) => entry.id === transaction.id);
          if (current) { current.status = status; if (status === 'confirmed') current.error = undefined; }
        });
      } catch {}
    }
    if (!this.store.exists(context)) throw new BrowserError('CANCELLED', '资料已关闭');
    this.publish(context); return this.get(context);
  }
  revokeSite(context: CommandContext, origin: string) {
    this.store.update(context, (document) => { delete document.grants[origin]; });
    this.publish(context); return this.get(context);
  }
  async refreshTransaction(context: CommandContext, id: string) {
    const session = this.store.get(context);
    const transaction = session.document.transactions.find((entry) => entry.id === id);
    if (!transaction?.hash) throw new BrowserError('UNAVAILABLE', '尚未取得交易标识，不能确认是否广播成功，请核对链上记录后处理');
    const network = session.document.networks.find((entry) => entry.id === transaction.networkId)!;
    const status = await this.chains.get(transaction.chain).status(network, transaction.hash);
    if (!this.store.exists(context)) throw new BrowserError('CANCELLED', '资料已关闭');
    this.store.update(context, (document) => {
      const entry = document.transactions.find((item) => item.id === id)!;
      entry.status = status; if (status === 'confirmed') entry.error = undefined;
    });
    this.publish(context); return this.get(context);
  }
  waitForApproval(context: CommandContext, id: string) {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settlements.delete(id);
        if (this.store.exists(context)) {
          this.store.update(context, (document) => {
            const request = document.requests.find((entry) => entry.id === id);
            if (request?.status === 'pending') { request.status = 'cancelled'; request.error = '确认超时'; delete document.pending[id]; }
          });
          this.publish(context);
        }
        reject(new BrowserError('CANCELLED', '站点请求确认超时'));
      }, 5 * 60 * 1000);
      this.settlements.set(id, { resolve, reject, timer });
    });
  }
  onChanged(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async dispose() {
    this.release();
    for (const id of this.settlements.keys()) this.settle(id, undefined, new BrowserError('CANCELLED', '钱包已退出'));
    this.discovery.dispose(); this.store.dispose(); this.listeners.clear(); await this.chains.dispose();
  }
  private settle(id: string, result?: string, error?: Error) {
    const pending = this.settlements.get(id);
    if (!pending) return;
    clearTimeout(pending.timer); this.settlements.delete(id);
    if (error) pending.reject(error); else pending.resolve(result!);
  }
  private onLock(context: CommandContext) {
    this.discovery?.cancelContext(context);
    if (!this.store.exists(context)) return;
    const requests = this.store.get(context).document.requests.filter((request) => request.status === 'pending');
    this.store.update(context, (document) => {
      for (const request of document.requests) if (request.status === 'pending') { request.status = 'cancelled'; request.error = '钱包已锁定'; delete document.pending[request.id]; }
    });
    for (const request of requests) this.settle(request.id, undefined, new BrowserError('CANCELLED', '钱包已锁定'));
    this.publish(context);
  }
  private publish(context: CommandContext) {
    if (!this.store.exists(context)) return;
    this.runtime.publish('wallet.changed', this.get(context), context.isPrivate ? { contextId: context.contextId } : { profileId: context.profileId });
    this.listeners.forEach((listener) => listener());
  }
}
