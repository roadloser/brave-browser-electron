import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { WalletState } from '../../../shared/contracts/wallet';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { WalletRepository, type WalletDocument } from './wallet-repository';
import { defaultNetworks } from './default-networks';
import { Keyring } from './keyring';

export type WalletSession = {
  document: WalletDocument; keyring: Keyring; balances: WalletState['balances']; context: CommandContext; queue: Promise<unknown>;
};
export class WalletStateStore {
  private readonly sessions = new Map<string, WalletSession>();
  constructor(private readonly runtime: FeatureRuntime, private readonly onLock: (context: CommandContext) => void) {}
  key(context: BrowserContext) { return context.isPrivate ? `private:${context.contextId}` : `profile:${context.profileId}`; }
  exists(context: BrowserContext) { return this.sessions.has(this.key(context)); }
  get(context: CommandContext): WalletSession {
    const key = this.key(context);
    const existing = this.sessions.get(key);
    if (existing) { existing.context = context; return existing; }
    const stored = new WalletRepository(this.runtime.storage.open(context.profileId)).read();
    const document: WalletDocument = stored ? structuredClone(stored) : {
      accounts: [], networks: structuredClone(defaultNetworks), requests: [], transactions: [], grants: {}, pending: {}, revision: 0,
    };
    if (context.isPrivate) { document.requests = []; document.transactions = []; document.grants = {}; document.pending = {}; }
    for (const request of document.requests) if (request.status === 'pending') { request.status = 'cancelled'; request.error = '应用重新启动，待确认请求已取消'; }
    document.pending = {};
    const session: WalletSession = { document, keyring: new Keyring(() => this.onLock(context)), balances: {}, context, queue: Promise.resolve() };
    this.sessions.set(key, session);
    return session;
  }
  update(context: CommandContext, operation: (document: WalletDocument) => void) {
    const session = this.get(context);
    const next = structuredClone(session.document);
    operation(next); next.revision++;
    if (!context.isPrivate) new WalletRepository(this.runtime.storage.open(context.profileId)).write(next);
    session.document = next;
    return next;
  }
  serial<Result>(context: CommandContext, operation: () => Promise<Result>): Promise<Result> {
    const session = this.get(context);
    const result = session.queue.then(operation);
    session.queue = result.catch(() => undefined);
    return result;
  }
  close(context: BrowserContext) {
    const key = this.key(context);
    this.sessions.get(key)?.keyring.dispose(); this.sessions.delete(key);
  }
  dispose() { this.sessions.forEach((session) => session.keyring.dispose()); this.sessions.clear(); }
}
