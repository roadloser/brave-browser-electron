import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import { mnemonicToSeedSync } from '@scure/bip39';
import { derivePath } from 'ed25519-hd-key';
import nacl from 'tweetnacl';
import { base58 } from '@scure/base';
import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import { amountToBase, formatAmount } from './network-client';
import type { ChainAdapterPort, KeyMaterial, PreparedTransfer, SignedTransfer, TransferIntent } from './adapter';
import { prepareSolanaDapp } from './solana-dapp';

export class SolanaAdapter implements ChainAdapterPort {
  readonly chain = 'solana' as const;
  readonly version = 'solana-web3-1.98.4/slip10';
  readonly capability = { chain: this.chain, account: true, transfer: true, messageSign: true, dapp: true, shielded: false };
  private pair(key: KeyMaterial) {
    const seed = mnemonicToSeedSync(key.mnemonic);
    try { return Keypair.fromSeed(derivePath(`m/44'/501'/${key.index}'/0'`, Buffer.from(seed).toString('hex')).key); }
    finally { seed.fill(0); }
  }
  async derive(key: KeyMaterial) { const pair = this.pair(key); try { return pair.publicKey.toBase58(); } finally { pair.secretKey.fill(0); } }
  async balance(account: WalletAccount, network: WalletNetwork) {
    return String(await new Connection(network.rpcUrl, 'confirmed').getBalance(new PublicKey(account.address)));
  }
  async prepare(_key: KeyMaterial, account: WalletAccount, network: WalletNetwork, intent: TransferIntent): Promise<PreparedTransfer> {
    const connection = new Connection(network.rpcUrl, 'confirmed');
    const amount = amountToBase(intent.value, network.decimals);
    const recent = await connection.getLatestBlockhash();
    const transaction = new Transaction({ feePayer: new PublicKey(account.address), ...recent })
      .add(SystemProgram.transfer({ fromPubkey: new PublicKey(account.address), toPubkey: new PublicKey(intent.to), lamports: amount }));
    const fee = (await connection.getFeeForMessage(transaction.compileMessage())).value;
    if (fee === null) throw new BrowserError('UNAVAILABLE', '无法取得 Solana 网络费');
    if (BigInt(await connection.getBalance(new PublicKey(account.address))) < amount + BigInt(fee)) throw new BrowserError('CONFLICT', '余额不足以支付金额与网络费');
    return { to: intent.to, value: intent.value, fee: formatAmount(String(fee), network.decimals), expiresAt: Date.now() + 45000,
      payload: { transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64') },
      details: { recipient: intent.to, value: `${intent.value} ${network.symbol}`, networkFee: `${formatAmount(String(fee), network.decimals)} ${network.symbol}`, network: network.name } };
  }
  async sign(key: KeyMaterial, _network: WalletNetwork, prepared: PreparedTransfer) {
    const pair = this.pair(key);
    try {
      const data = prepared.payload as { transaction: string; versioned?: boolean };
      if (data.versioned) {
        const transaction = VersionedTransaction.deserialize(Buffer.from(data.transaction, 'base64'));
        transaction.sign([pair]);
        return { payload: Buffer.from(transaction.serialize()).toString('base64'), hash: base58.encode(transaction.signatures[0]) };
      }
      const transaction = Transaction.from(Buffer.from(data.transaction, 'base64'));
      transaction.sign(pair);
      return { payload: transaction.serialize().toString('base64'), hash: transaction.signature ? base58.encode(transaction.signature) : undefined };
    } finally { pair.secretKey.fill(0); }
  }
  async signMessage(key: KeyMaterial, _network: WalletNetwork, message: string) {
    return this.signBytes(key, _network, Buffer.from(message, 'utf8'));
  }
  async signBytes(key: KeyMaterial, _network: WalletNetwork, message: Uint8Array) {
    const pair = this.pair(key);
    try { return Buffer.from(nacl.sign.detached(message, pair.secretKey)).toString('base64'); }
    finally { pair.secretKey.fill(0); }
  }
  prepareDapp(_key: KeyMaterial, account: WalletAccount, network: WalletNetwork, payload: unknown) { return prepareSolanaDapp(account, network, payload); }
  async broadcast(network: WalletNetwork, signed: SignedTransfer) {
    return new Connection(network.rpcUrl, 'confirmed').sendRawTransaction(Buffer.from(signed.payload, 'base64'), { skipPreflight: false });
  }
  async status(network: WalletNetwork, hash: string) {
    const response = await new Connection(network.rpcUrl, 'confirmed').getSignatureStatus(hash, { searchTransactionHistory: true });
    if (!response.value) return 'unknown' as const;
    if (response.value.err) return 'failed' as const;
    return ['confirmed', 'finalized'].includes(response.value.confirmationStatus ?? '') ? 'confirmed' as const : 'pending' as const;
  }
  dispose() {}
}
