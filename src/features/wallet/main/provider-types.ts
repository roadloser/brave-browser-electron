import type { CommandContext } from '../../../shared/module-lifecycle';
import type { WalletAccount, WalletNetwork } from '../../../shared/contracts/wallet';
import type { WalletService } from './wallet-service';

export type ProviderCall = { chain: 'ethereum' | 'solana' | 'cardano'; method: string; params: unknown[]; accountId?: string };
export type ProviderScope = {
  context: CommandContext; origin: string; tabId: string; account: WalletAccount; network: WalletNetwork;
  wallet: WalletService; sourceIsCurrent: () => boolean; approve: (id: string) => Promise<string>;
};
