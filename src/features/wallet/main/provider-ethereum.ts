import { z } from 'zod';
import { BrowserError } from '../../../shared/errors';
import { rpc } from './chains/network-client';
import type { ProviderCall, ProviderScope } from './provider-types';

const readMethods = new Set(['eth_blockNumber', 'eth_getBalance', 'eth_getTransactionCount', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_getTransactionReceipt', 'eth_getCode', 'eth_getBlockByNumber']);
export async function ethereumRequest(scope: ProviderScope, input: ProviderCall): Promise<unknown> {
  const { context, origin, tabId, account, network, wallet, approve } = scope;
  const source = { origin, tabId };
  if (['eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'].includes(input.method)) {
    if (typeof input.params[0] !== 'string' || input.params[0].toLowerCase() !== account.address.toLowerCase()) throw new BrowserError('FORBIDDEN', '签名账户与授权不一致');
    return approve(wallet.transactions.typedData(context, account.id, input.params[1], source));
  }
  if (['wallet_switchEthereumChain', 'wallet_addEthereumChain'].includes(input.method)) {
    const id = input.method === 'wallet_addEthereumChain' ? await wallet.networks.add(context, account.id, source, input.params[0]) :
      wallet.networks.switch(context, account.id, source, z.object({ chainId: z.string().regex(/^0x[0-9a-f]+$/i) }).parse(input.params[0]).chainId);
    await approve(id); return null;
  }
  if (input.method === 'personal_sign') {
    const [raw, address] = input.params;
    if (typeof raw !== 'string' || typeof address !== 'string' || address.toLowerCase() !== account.address.toLowerCase()) throw new BrowserError('FORBIDDEN', '签名账户与授权不一致');
    if (!/^0x([0-9a-f]{2})*$/i.test(raw)) throw new BrowserError('INVALID_ARGUMENT', '消息必须是十六进制字节');
    return approve(wallet.transactions.messageBytes(context, account.id, Buffer.from(raw.slice(2), 'hex'), source));
  }
  if (input.method === 'eth_sendTransaction') {
    const id = await wallet.store.serial(context, () => wallet.transactions.dapp(context, account.id, input.params[0], source));
    return approve(id);
  }
  if (readMethods.has(input.method)) return rpc(network.rpcUrl, input.method, input.params);
  throw new BrowserError('UNAVAILABLE', `尚未映射此以太坊方法：${input.method}`);
}
