import { z } from 'zod';
import { HDNodeWallet, JsonRpcProvider, getAddress, formatUnits } from 'ethers';
import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import type { KeyMaterial, PreparedTransfer } from './adapter';

const hexValue = z.string().regex(/^0x[0-9a-f]+$/i);
const transactionSchema = z.object({
  from: z.string(), to: z.string(), value: hexValue.optional(),
  data: z.string().regex(/^0x([0-9a-f]{2})*$/i).max(200000).optional(),
  gas: hexValue.optional(), gasPrice: hexValue.optional(), maxFeePerGas: hexValue.optional(),
  maxPriorityFeePerGas: hexValue.optional(), nonce: hexValue.optional(), chainId: hexValue.optional(),
}).strict();
export async function prepareEthereumDapp(key: KeyMaterial, account: WalletAccount, network: WalletNetwork, input: unknown): Promise<PreparedTransfer> {
  const source = transactionSchema.parse(input);
  if (getAddress(source.from) !== getAddress(account.address)) throw new BrowserError('FORBIDDEN', '交易账户与授权不一致');
  const provider = new JsonRpcProvider(network.rpcUrl);
  try {
    const actual = await provider.getNetwork();
    if (network.chainId && actual.chainId !== BigInt(network.chainId)) throw new BrowserError('CONFLICT', 'RPC网络与配置不一致');
    if (source.chainId && actual.chainId !== BigInt(source.chainId)) throw new BrowserError('CONFLICT', '站点交易网络与当前账户不同');
    const wallet = HDNodeWallet.fromPhrase(key.mnemonic, '', `m/44'/60'/0'/0/${key.index}`).connect(provider);
    const transaction = await wallet.populateTransaction({
      to: getAddress(source.to), value: source.value ? BigInt(source.value) : 0n, data: source.data ?? '0x',
      gasLimit: source.gas ? BigInt(source.gas) : undefined,
      gasPrice: source.gasPrice ? BigInt(source.gasPrice) : undefined,
      maxFeePerGas: source.maxFeePerGas ? BigInt(source.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: source.maxPriorityFeePerGas ? BigInt(source.maxPriorityFeePerGas) : undefined,
      nonce: source.nonce ? Number(BigInt(source.nonce)) : undefined,
    });
    const fee = BigInt(transaction.gasLimit ?? 0) * BigInt(transaction.maxFeePerGas ?? transaction.gasPrice ?? 0);
    const value = BigInt(source.value ?? 0);
    if (await provider.getBalance(account.address) < fee + value) throw new BrowserError('CONFLICT', '余额不足以支付金额与最大网络费');
    const data = source.data ?? '0x';
    return {
      to: source.to, value: formatUnits(value, network.decimals), fee: formatUnits(fee, network.decimals),
      expiresAt: Date.now() + 120000,
      payload: JSON.parse(JSON.stringify(transaction, (_name, entry) => typeof entry === 'bigint' ? entry.toString() : entry)),
      details: { recipient: source.to, value: `${formatUnits(value, network.decimals)} ${network.symbol}`,
        maxNetworkFee: `${formatUnits(fee, network.decimals)} ${network.symbol}`, network: network.name,
        ...(data !== '0x' ? { operation: '合约调用，完整调用数据如下；当前未解码资产授权含义', selector: data.slice(0, 10), data } : {}) },
    };
  } finally { provider.destroy(); }
}
