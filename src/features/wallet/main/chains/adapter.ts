import type { WalletAccount, WalletCapability, WalletChain, WalletNetwork } from '../../../../shared/contracts/wallet';
import type { BitcoinDiscovery, BitcoinPublicAccount } from './bitcoin-discovery';

export type KeyMaterial = { mnemonic: string; index: number };
export type TransferIntent = { to: string; value: string };
export type PreparedTransfer = {
  to: string; value: string; fee: string; details: Record<string, string>;
  payload: unknown; expiresAt: number;
};
export type SignedTransfer = { payload: string; hash?: string };
export interface ChainAdapterPort {
  readonly chain: WalletChain;
  readonly version: string;
  readonly capability: WalletCapability;
  derive(key: KeyMaterial, network: WalletNetwork): Promise<string>;
  balance(account: WalletAccount, network: WalletNetwork): Promise<string>;
  prepare(key: KeyMaterial, account: WalletAccount, network: WalletNetwork, intent: TransferIntent): Promise<PreparedTransfer>;
  sign(key: KeyMaterial, network: WalletNetwork, prepared: PreparedTransfer): Promise<SignedTransfer>;
  signMessage(key: KeyMaterial, network: WalletNetwork, message: string): Promise<string>;
  signBytes?(key: KeyMaterial, network: WalletNetwork, message: Uint8Array): Promise<string>;
  prepareDapp?(key: KeyMaterial, account: WalletAccount, network: WalletNetwork, payload: unknown): Promise<PreparedTransfer>;
  broadcast(network: WalletNetwork, signed: SignedTransfer): Promise<string>;
  status(network: WalletNetwork, hash: string): Promise<'pending' | 'confirmed' | 'failed' | 'unknown'>;
  dispose(): void | Promise<void>;
  initializeDiscovery?(key: KeyMaterial, network: WalletNetwork): Promise<BitcoinPublicAccount>;
  discover?(account: WalletAccount, network: WalletNetwork, state: BitcoinPublicAccount, signal?: AbortSignal): Promise<BitcoinDiscovery>;
}
