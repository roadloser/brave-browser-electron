import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CommandContext } from '../../../shared/module-lifecycle';
import type { WalletNetwork } from '../../../shared/contracts/wallet';
import { BrowserError } from '../../../shared/errors';
import type { WalletStateStore } from './wallet-state';
import { rpc, safeNetworkUrl } from './chains/network-client';

const chainSchema = z.object({
  chainId: z.string().regex(/^0x[0-9a-f]+$/i), chainName: z.string().min(1).max(128),
  nativeCurrency: z.object({ name: z.string(), symbol: z.string().min(1).max(16), decimals: z.number().int().min(0).max(36) }),
  rpcUrls: z.array(z.string().url()).min(1).max(10), blockExplorerUrls: z.array(z.string().url()).optional(),
  iconUrls: z.array(z.string().url()).optional(),
});
export class NetworkRequests {
  constructor(private readonly store: WalletStateStore, private readonly publish: (context: CommandContext) => void) {}
  async add(context: CommandContext, accountId: string, source: { origin: string; tabId: string }, raw: unknown) {
    const input = chainSchema.parse(raw);
    const rpcUrl = safeNetworkUrl(input.rpcUrls[0]).href;
    const expected = BigInt(input.chainId);
    const actual = await rpc<string>(rpcUrl, 'eth_chainId', []);
    if (BigInt(actual) !== expected) throw new BrowserError('CONFLICT', '网络返回的chainId与站点请求不一致');
    const network: WalletNetwork = {
      id: `ethereum-${expected.toString()}`, chain: 'ethereum', name: input.chainName, rpcUrl,
      chainId: `0x${expected.toString(16)}`, symbol: input.nativeCurrency.symbol, decimals: input.nativeCurrency.decimals, testnet: false,
    };
    return this.create(context, accountId, source, network, true);
  }
  switch(context: CommandContext, accountId: string, source: { origin: string; tabId: string }, chainId: string) {
    const expected = BigInt(chainId);
    const network = this.store.get(context).document.networks.find((entry) => entry.chain === 'ethereum' && entry.chainId && BigInt(entry.chainId) === expected);
    if (!network) throw new BrowserError('NOT_FOUND', '未知网络，请先请求添加该网络', true, { providerCode: 4902 });
    return this.create(context, accountId, source, network, false);
  }
  private create(context: CommandContext, accountId: string, source: { origin: string; tabId: string }, network: WalletNetwork, adding: boolean) {
    const id = randomUUID();
    this.store.update(context, (document) => {
      document.requests.push({ id, kind: 'network', accountId, networkId: network.id, ...source,
        summary: adding ? '添加并切换到新网络' : '切换网络', details: { network: network.name, chainId: network.chainId!, rpcUrl: network.rpcUrl, currency: network.symbol },
        status: 'pending', createdAt: Date.now() });
      document.pending[id] = { providerMethod: 'switchNetwork', targetNetwork: network };
    });
    this.publish(context); return id;
  }
}
