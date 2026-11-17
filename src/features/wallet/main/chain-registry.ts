import type { WalletCapability, WalletChain } from '../../../shared/contracts/wallet';
import { BrowserError } from '../../../shared/errors';
import type { ChainAdapterPort } from './chains/adapter';
import { EthereumAdapter } from './chains/ethereum';
import { SolanaAdapter } from './chains/solana';
import { BitcoinAdapter } from './chains/bitcoin';
import { FilecoinAdapter } from './chains/filecoin';
import { CardanoAdapter } from './chains/cardano';
import { PolkadotAdapter } from './chains/polkadot';

export class ChainRegistry {
  private readonly adapters = new Map<WalletChain, ChainAdapterPort>();
  constructor() {
    for (const adapter of [new EthereumAdapter(), new SolanaAdapter(), new BitcoinAdapter(), new FilecoinAdapter(), new CardanoAdapter(), new PolkadotAdapter()]) {
      this.adapters.set(adapter.chain, adapter);
    }
  }
  get(chain: WalletChain) {
    const adapter = this.adapters.get(chain);
    if (!adapter) throw new BrowserError('UNAVAILABLE', 'Zcash 软件屏蔽钱包需要具备 ZIP32 与 Orchard/Ironwood 软件签名的受维护制品，当前候选尚未满足');
    return adapter;
  }
  capabilities(): WalletCapability[] {
    return [...this.adapters.values()].map((adapter) => adapter.capability).concat([{
      chain: 'zcash', account: false, transfer: false, messageSign: false, dapp: false, shielded: false,
      reason: '现成 Ledger SDK 提供扫描/证明但不提供软件密钥与签名；软件全等效制品仍待解决，未启用透明替代',
    }]);
  }
  async dispose() { await Promise.all([...this.adapters.values()].map((adapter) => adapter.dispose())); }
}
