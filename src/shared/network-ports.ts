import type { BrowserContext } from './contracts/browser-core';

export type NetworkPurpose = 'leo' | 'translation' | 'news' | 'wallet' | 'rewards' | 'sync' | 'rules';
export interface ContextNetworkPort {
  fetch(context: BrowserContext, input: string, init?: RequestInit & { purpose: NetworkPurpose }): Promise<Response>;
}
