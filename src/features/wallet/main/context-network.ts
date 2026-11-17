import { AsyncLocalStorage } from 'node:async_hooks';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { ContextNetworkPort } from '../../../shared/network-ports';
import { BrowserError } from '../../../shared/errors';

type WalletNetworkScope = { context: BrowserContext; network: ContextNetworkPort };
const scopes = new AsyncLocalStorage<WalletNetworkScope>();

export function withWalletNetwork<Result>(context: BrowserContext, network: ContextNetworkPort, operation: () => Result): Result {
  return scopes.run({ context, network }, operation);
}
export function walletFetch(input: string, init?: RequestInit): Promise<Response> {
  const scope = scopes.getStore();
  if (!scope) throw new BrowserError('FORBIDDEN', '钱包网络请求缺少资料上下文');
  return scope.network.fetch(scope.context, input, { ...init, purpose: 'wallet' });
}
export function walletNetworkContext() {
  const scope = scopes.getStore();
  if (!scope) throw new BrowserError('FORBIDDEN', '钱包网络请求缺少资料上下文');
  return scope.context;
}
