import { z } from 'zod';
import { idSchema } from './browser-core';
import { originSchema } from './site-settings';

export const walletChainSchema = z.enum(['ethereum', 'solana', 'bitcoin', 'filecoin', 'cardano', 'polkadot', 'zcash']);
export type WalletChain = z.infer<typeof walletChainSchema>;
export const walletNetworkSchema = z.object({
  id: idSchema, chain: walletChainSchema, name: z.string().trim().min(1).max(128),
  rpcUrl: z.string().url().max(2048), chainId: z.string().max(128).optional(),
  symbol: z.string().min(1).max(16), decimals: z.number().int().min(0).max(36), testnet: z.boolean(),
});
export type WalletNetwork = z.infer<typeof walletNetworkSchema>;
export type WalletAccount = {
  id: string; chain: WalletChain; networkId: string; name: string; address: string; index: number;
  receiveIndex?: number; changeIndex?: number;
  discovery?: { status: 'idle' | 'scanning' | 'ready' | 'failed'; scannedAt?: number; error?: string };
};
export type WalletCapability = {
  chain: WalletChain; account: boolean; transfer: boolean; messageSign: boolean;
  dapp: boolean; shielded: boolean; reason?: string;
};
export type WalletRequest = {
  id: string; kind: 'connect' | 'message' | 'transfer' | 'transaction';
  origin?: string; tabId?: string; accountId: string; networkId: string;
  summary: string; details: Record<string, string>;
  status: 'pending' | 'approved' | 'rejected' | 'failed' | 'cancelled';
  createdAt: number; result?: string; error?: string;
};
export type WalletTransaction = {
  id: string; chain: WalletChain; accountId: string; networkId: string;
  to: string; value: string; hash?: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'failed' | 'unknown';
  error?: string; createdAt: number;
};
export type WalletState = {
  initialized: boolean; locked: boolean; accounts: WalletAccount[]; networks: WalletNetwork[];
  selectedAccountId?: string; capabilities: WalletCapability[];
  requests: WalletRequest[]; transactions: WalletTransaction[];
  balances: Record<string, { value: string; formatted: string; updatedAt: number; error?: string }>;
  revision: number;
};
export const walletCommandSchemas = {
  'wallet.get': z.object({}),
  'wallet.create': z.object({ password: z.string().min(8).max(1024) }),
  'wallet.unlock': z.object({ password: z.string().min(1).max(1024) }),
  'wallet.lock': z.object({}),
  'wallet.backup': z.object({ password: z.string().min(1).max(1024) }),
  'wallet.import': z.object({ password: z.string().min(8).max(1024) }),
  'wallet.addAccount': z.object({ chain: walletChainSchema, networkId: idSchema, name: z.string().trim().min(1).max(128) }),
  'wallet.selectAccount': z.object({ id: idSchema }),
  'wallet.addNetwork': walletNetworkSchema,
  'wallet.requestTransfer': z.object({ accountId: idSchema, to: z.string().trim().min(1).max(2048), value: z.string().regex(/^\d+(?:\.\d+)?$/).max(128) }),
  'wallet.requestDappTransaction': z.object({ accountId: idSchema, payload: z.string().min(1).max(500000) }),
  'wallet.requestSign': z.object({ accountId: idSchema, message: z.string().min(1).max(100000) }),
  'wallet.approve': z.object({ id: idSchema, confirmed: z.literal(true) }),
  'wallet.reject': z.object({ id: idSchema }),
  'wallet.refresh': z.object({ accountId: idSchema.optional() }),
  'wallet.refreshTransaction': z.object({ id: idSchema }),
  'wallet.revokeSite': z.object({ origin: originSchema }),
};
export interface WalletCommandResults {
  'wallet.get': WalletState;
  'wallet.create': WalletState;
  'wallet.unlock': WalletState;
  'wallet.lock': WalletState;
  'wallet.backup': { displayed: boolean };
  'wallet.import': WalletState;
  'wallet.addAccount': WalletState;
  'wallet.selectAccount': WalletState;
  'wallet.addNetwork': WalletState;
  'wallet.requestTransfer': WalletState;
  'wallet.requestDappTransaction': WalletState;
  'wallet.requestSign': WalletState;
  'wallet.approve': WalletState;
  'wallet.reject': WalletState;
  'wallet.refresh': WalletState;
  'wallet.refreshTransaction': WalletState;
  'wallet.revokeSite': WalletState;
}
