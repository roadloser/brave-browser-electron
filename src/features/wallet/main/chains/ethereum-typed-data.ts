import { HDNodeWallet, TypedDataEncoder, getAddress } from 'ethers';
import { z } from 'zod';
import type { WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import type { KeyMaterial } from './adapter';

const typedDataSchema = z.object({
  domain: z.object({ name: z.string().optional(), version: z.string().optional(),
    chainId: z.union([z.string(), z.number().int().nonnegative()]).optional(),
    verifyingContract: z.string().optional(), salt: z.string().optional() }).strict(),
  types: z.record(z.string(), z.array(z.object({ name: z.string(), type: z.string() }).strict()).max(100)),
  primaryType: z.string().min(1),
  message: z.record(z.string(), z.unknown()),
}).strict();
export type EthereumTypedData = z.infer<typeof typedDataSchema>;
export function parseTypedData(input: unknown, network: WalletNetwork): EthereumTypedData {
  const parsed = typedDataSchema.parse(typeof input === 'string' ? JSON.parse(input) : input);
  if (parsed.domain.chainId !== undefined && network.chainId && BigInt(parsed.domain.chainId) !== BigInt(network.chainId)) {
    throw new BrowserError('CONFLICT', '签名域chainId与当前网络不一致');
  }
  if (parsed.domain.verifyingContract) getAddress(parsed.domain.verifyingContract);
  const { EIP712Domain: _domain, ...types } = parsed.types;
  const encoder = TypedDataEncoder.from(types);
  if (encoder.primaryType !== parsed.primaryType) throw new BrowserError('INVALID_ARGUMENT', 'EIP-712主类型与类型图不一致');
  TypedDataEncoder.hash(parsed.domain, types, parsed.message);
  return parsed;
}
export async function signEthereumTypedData(key: KeyMaterial, data: EthereumTypedData) {
  const { EIP712Domain: _domain, ...types } = data.types;
  return HDNodeWallet.fromPhrase(key.mnemonic, '', `m/44'/60'/0'/0/${key.index}`).signTypedData(data.domain, types, data.message);
}
