import { BrowserError } from '../../../shared/errors';
import type { CommandContext } from '../../../shared/module-lifecycle';
import type { WalletService } from './wallet-service';
import type { ProviderCall, ProviderScope } from './provider-types';
import { ethereumRequest } from './provider-ethereum';
import { solanaChain, solanaRequest } from './provider-solana';
import { cardanoRequest } from './provider-cardano';

export async function handleProviderRequest(wallet: WalletService, context: CommandContext, origin: string, tabId: string,
  input: ProviderCall, sourceIsCurrent: () => boolean): Promise<unknown> {
  const session = wallet.store.get(context);
  const accounts = session.document.accounts.filter((account) => account.chain === input.chain);
  const account = accounts.find((entry) => entry.id === session.document.selectedAccountId) ?? accounts[0];
  const allowed = (session.document.grants[origin] ?? []).filter((id) => accounts.some((entry) => entry.id === id));
  if (input.method === 'eth_accounts') return session.keyring.unlocked ? accounts.filter((entry) => allowed.includes(entry.id)).map((entry) => entry.address) : [];
  if (input.method === 'isEnabled') return Boolean(account && session.keyring.unlocked && allowed.includes(account.id));
  if (!account) throw new BrowserError('FORBIDDEN', '请在钱包中添加对应链的账户');
  const network = session.document.networks.find((entry) => entry.id === account.networkId)!;
  if (input.method === 'eth_chainId') return network.chainId;
  if (input.method === 'net_version') return network.chainId ? BigInt(network.chainId).toString() : '0';
  if (!session.keyring.unlocked) throw new BrowserError('FORBIDDEN', '钱包已锁定，请在钱包面板解锁');
  if (['eth_requestAccounts', 'connect', 'enable'].includes(input.method)) {
    if (!allowed.includes(account.id)) {
      const id = wallet.transactions.connect(context, account.id, origin, tabId);
      wallet.transactions.bindSource(id, sourceIsCurrent);
      await wallet.waitForApproval(context, id);
    }
    if (input.chain === 'ethereum') return [account.address];
    if (input.chain === 'cardano') return { accountId: account.id };
    return { publicKey: account.address, chain: solanaChain(network.rpcUrl, network.testnet) };
  }
  if (!allowed.includes(account.id)) throw new BrowserError('FORBIDDEN', '请先允许站点访问此账户');
  if (input.method === 'disconnect') { wallet.revokeSite(context, origin); return null; }
  const scope: ProviderScope = {
    context, origin, tabId, account, network, wallet, sourceIsCurrent,
    approve(id) {
      wallet.transactions.bindSource(id, () => sourceIsCurrent() && Boolean(wallet.store.get(context).document.grants[origin]?.includes(account.id)));
      return wallet.waitForApproval(context, id);
    },
  };
  if (input.chain === 'ethereum') return ethereumRequest(scope, input);
  if (input.chain === 'cardano') return cardanoRequest(scope, input);
  return solanaRequest(scope, input);
}
