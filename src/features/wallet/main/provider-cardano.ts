import * as Cardano from '@emurgo/cardano-serialization-lib-nodejs';
import { z } from 'zod';
import { BrowserError } from '../../../shared/errors';
import type { ProviderCall, ProviderScope } from './provider-types';

const queryMethods = new Set(['getExtensions', 'getNetworkId', 'getUsedAddresses', 'getUnusedAddresses', 'getChangeAddress', 'getRewardAddresses', 'getBalance', 'getUtxos', 'getCollateral']);
const bytesSchema = z.string().regex(/^(?:[a-f0-9]{2})*$/i).max(500000);
export async function cardanoRequest(scope: ProviderScope, input: ProviderCall): Promise<unknown> {
  const { context, origin, tabId, account, network, wallet, approve } = scope;
  if (input.accountId && input.accountId !== account.id) throw new BrowserError('CONFLICT', '当前账户已改变，请重新调用 enable', true, { providerCode: -4 });
  const adapter = wallet.chains.get('cardano');
  if (queryMethods.has(input.method)) return adapter.providerQuery!(account, network, input.method, input.params);
  const source = { origin, tabId };
  if (input.method === 'signData') {
    const rawAddress = z.string().parse(input.params[0]);
    const address = rawAddress.startsWith('addr') ? Cardano.Address.from_bech32(rawAddress) : Cardano.Address.from_bytes(Buffer.from(bytesSchema.parse(rawAddress), 'hex'));
    if (address.to_bech32() !== account.address) throw new BrowserError('FORBIDDEN', '签名地址不属于当前账户', true, { providerCode: 2 });
    const bytes = Buffer.from(bytesSchema.parse(input.params[1]), 'hex');
    return JSON.parse(await approve(wallet.transactions.messageBytes(context, account.id, bytes, source)));
  }
  if (input.method === 'signTx' || input.method === 'submitTx') {
    const payload = {
      transaction: bytesSchema.parse(input.params[0]),
      partialSign: input.method === 'signTx' ? z.boolean().default(false).parse(input.params[1]) : false,
      submitOnly: input.method === 'submitTx',
    };
    const id = await wallet.store.serial(context, () => wallet.transactions.dapp(context, account.id, payload, source, input.method === 'signTx'));
    return approve(id);
  }
  throw new BrowserError('UNAVAILABLE', `尚未映射此 Cardano 方法：${input.method}`, true, { providerCode: -1 });
}
