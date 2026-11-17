import { HDKey } from '@scure/bip32';
import * as btc from '@scure/btc-signer';
import type { WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import { networkFetch } from './network-client';

export type BitcoinPublicAccount = {
  version: 1;
  xpub: string;
  nextReceiveIndex: number;
  nextChangeIndex: number;
  lastScannedAt: number | null;
};
export type BitcoinAddress = { address: string; branch: 0 | 1; index: number; publicKey: Uint8Array; script: Uint8Array; used: boolean };
export type BitcoinDiscovery = { state: BitcoinPublicAccount; addresses: BitcoinAddress[]; balance: string; receiveAddress: string; changeAddress: string };
type AddressStats = {
  chain_stats: { tx_count: number; funded_txo_sum: number; spent_txo_sum: number };
  mempool_stats: { tx_count: number; funded_txo_sum: number; spent_txo_sum: number };
};
const gapLimit = 20;

export function bitcoinAddress(state: BitcoinPublicAccount, network: WalletNetwork, branch: 0 | 1, index: number): BitcoinAddress {
  const publicKey = HDKey.fromExtendedKey(state.xpub).deriveChild(branch).deriveChild(index).publicKey!;
  const payment = btc.p2wpkh(publicKey, network.testnet ? btc.TEST_NETWORK : btc.NETWORK);
  return { address: payment.address!, branch, index, publicKey, script: payment.script, used: false };
}

export async function discoverBitcoin(state: BitcoinPublicAccount, network: WalletNetwork, signal?: AbortSignal): Promise<BitcoinDiscovery> {
  const addresses: BitcoinAddress[] = [];
  let balance = 0n;
  const nextIndices = [state.nextReceiveIndex, state.nextChangeIndex];
  for (const branch of [0, 1] as const) {
    let lastUsed = -1;
    let index = 0;
    let stop = Math.max(gapLimit, nextIndices[branch] + gapLimit);
    while (index < stop) {
      signal?.throwIfAborted();
      const count = Math.min(5, stop - index);
      const batch = await Promise.all(Array.from({ length: count }, async (_value, offset) => {
        const address = bitcoinAddress(state, network, branch, index + offset);
        const response = await networkFetch(`${network.rpcUrl.replace(/\/$/, '')}/address/${encodeURIComponent(address.address)}`, { signal });
        const stats = await response.json() as AddressStats;
        const quantities = [stats.chain_stats?.funded_txo_sum, stats.chain_stats?.spent_txo_sum, stats.mempool_stats?.funded_txo_sum, stats.mempool_stats?.spent_txo_sum];
        if (!quantities.every((value) => Number.isSafeInteger(value) && value >= 0)) {
          throw new BrowserError('UNAVAILABLE', 'Bitcoin 地址统计响应无效，未更新账户余额');
        }
        return { address, stats };
      }));
      for (const { address, stats } of batch) {
        address.used = stats.chain_stats.tx_count > 0 || stats.mempool_stats.tx_count > 0;
        if (address.used) lastUsed = Math.max(lastUsed, address.index);
        balance += BigInt(stats.chain_stats.funded_txo_sum) - BigInt(stats.chain_stats.spent_txo_sum)
          + BigInt(stats.mempool_stats.funded_txo_sum) - BigInt(stats.mempool_stats.spent_txo_sum);
        addresses.push(address);
      }
      index += count;
      stop = Math.max(stop, lastUsed + 1 + gapLimit);
      if (stop >= 0x80000000) throw new BrowserError('UNAVAILABLE', 'Bitcoin 派生索引超出范围');
    }
    nextIndices[branch] = Math.max(nextIndices[branch], lastUsed + 1);
  }
  const next: BitcoinPublicAccount = {
    ...state, nextReceiveIndex: nextIndices[0], nextChangeIndex: nextIndices[1], lastScannedAt: Date.now(),
  };
  return {
    state: next, addresses, balance: balance.toString(),
    receiveAddress: bitcoinAddress(next, network, 0, next.nextReceiveIndex).address,
    changeAddress: bitcoinAddress(next, network, 1, next.nextChangeIndex).address,
  };
}
