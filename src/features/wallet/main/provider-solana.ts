import { z } from 'zod';
import { BrowserError } from '../../../shared/errors';
import type { ProviderCall, ProviderScope } from './provider-types';

export function solanaChain(rpcUrl: string, testnet: boolean) {
  return testnet ? rpcUrl.includes('devnet') ? 'solana:devnet' : 'solana:testnet' : 'solana:mainnet';
}
export async function solanaRequest(scope: ProviderScope, input: ProviderCall): Promise<unknown> {
  const { context, origin, tabId, account, wallet, approve } = scope;
  const source = { origin, tabId };
  if (input.method === 'signMessage') {
    const encoded = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).parse(input.params[0]);
    const signature = await approve(wallet.transactions.messageBytes(context, account.id, Buffer.from(encoded, 'base64'), source));
    return { signature, publicKey: account.address };
  }
  if (['signTransaction', 'signAndSendTransaction'].includes(input.method)) {
    const id = await wallet.store.serial(context, () => wallet.transactions.dapp(context, account.id, input.params[0], source, input.method === 'signTransaction'));
    const result = await approve(id);
    return input.method === 'signTransaction' ? { transaction: result } : { signature: result };
  }
  throw new BrowserError('UNAVAILABLE', `尚未映射此 Solana 方法：${input.method}`);
}
