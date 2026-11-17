import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { z } from 'zod';
import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import type { PreparedTransfer } from './adapter';
import { formatAmount } from './network-client';
import { BrowserError } from '../../../../shared/errors';

const payloadSchema = z.object({ transaction: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(200000), encoding: z.literal('base64') }).strict();
export async function prepareSolanaDapp(account: WalletAccount, network: WalletNetwork, input: unknown): Promise<PreparedTransfer> {
  const source = payloadSchema.parse(input);
  const bytes = Buffer.from(source.transaction, 'base64');
  let legacy: Transaction | undefined;
  let versioned: VersionedTransaction | undefined;
  try { legacy = Transaction.from(bytes); } catch { versioned = VersionedTransaction.deserialize(bytes); }
  const message = legacy ? legacy.compileMessage() : versioned!.message;
  const signerKeys = 'staticAccountKeys' in message ? message.staticAccountKeys : message.accountKeys;
  const signerIndex = signerKeys.slice(0, message.header.numRequiredSignatures).findIndex((key) => key.equals(new PublicKey(account.address)));
  if (signerIndex < 0) throw new BrowserError('FORBIDDEN', '交易没有请求当前账户签名');
  if (signerIndex !== 0) throw new BrowserError('UNAVAILABLE', '当前站点交易要求共同签名，需专门多签确认映射');
  const connection = new Connection(network.rpcUrl, 'confirmed');
  const fee = (await connection.getFeeForMessage(message)).value;
  if (fee === null) throw new BrowserError('UNAVAILABLE', '交易区块哈希已过期或网络费不可用');
  let programs: string[];
  if (legacy) programs = legacy.instructions.map((instruction) => instruction.programId.toBase58());
  else programs = versioned!.message.compiledInstructions.map((instruction) => signerKeys[instruction.programIdIndex]?.toBase58() ?? '地址查找表中的程序');
  return {
    to: '多个程序调用', value: '0', fee: formatAmount(String(fee), network.decimals), expiresAt: Date.now() + 30000,
    payload: { transaction: source.transaction, versioned: Boolean(versioned) },
    details: { feePayer: signerKeys[0].toBase58(), networkFee: `${formatAmount(String(fee), network.decimals)} SOL`, network: network.name,
      programs: [...new Set(programs)].join('\n'), operation: '站点提供的序列化交易；当前未解码每项资产转移与授权', serializedTransaction: source.transaction },
  };
}
