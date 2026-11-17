import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import * as btc from '@scure/btc-signer';
import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import type { ChainAdapterPort, KeyMaterial, PreparedTransfer, SignedTransfer, TransferIntent } from './adapter';
import { amountToBase, formatAmount, networkFetch } from './network-client';

type Utxo = { txid: string; vout: number; value: number; status: { confirmed: boolean } };
type BitcoinPayload = { psbt: string; paths: string[] };

export class BitcoinAdapter implements ChainAdapterPort {
  readonly chain = 'bitcoin' as const;
  readonly version = 'scure-btc-signer-2.4.1/bip84';
  readonly capability = { chain: this.chain, account: true, transfer: true, messageSign: false, dapp: false, shielded: false,
    reason: '独立地址资金可用；完整地址发现与 PSBT 站点协议仍需对应适配' };
  private root(key: KeyMaterial, network: WalletNetwork) {
    const seed = mnemonicToSeedSync(key.mnemonic);
    try { return HDKey.fromMasterSeed(seed).derive(`m/84'/${network.testnet ? 1 : 0}'/${key.index}'`); }
    finally { seed.fill(0); }
  }
  private network(network: WalletNetwork) { return network.testnet ? btc.TEST_NETWORK : btc.NETWORK; }
  async derive(key: KeyMaterial, network: WalletNetwork) {
    const root = this.root(key, network);
    try { return btc.p2wpkh(root.deriveChild(0).deriveChild(0).publicKey!, this.network(network)).address!; }
    finally { root.wipePrivateData(); }
  }
  async balance(account: WalletAccount, network: WalletNetwork) {
    const response = await networkFetch(`${network.rpcUrl.replace(/\/$/, '')}/address/${encodeURIComponent(account.address)}`);
    const data = await response.json() as { chain_stats: { funded_txo_sum: number; spent_txo_sum: number }; mempool_stats: { funded_txo_sum: number; spent_txo_sum: number } };
    return String(BigInt(data.chain_stats.funded_txo_sum) - BigInt(data.chain_stats.spent_txo_sum) + BigInt(data.mempool_stats.funded_txo_sum) - BigInt(data.mempool_stats.spent_txo_sum));
  }
  async prepare(key: KeyMaterial, account: WalletAccount, network: WalletNetwork, intent: TransferIntent): Promise<PreparedTransfer> {
    const root = this.root(key, network);
    try {
      const paymentKey = root.deriveChild(0).deriveChild(0);
      const spend = btc.p2wpkh(paymentKey.publicKey!, this.network(network));
      if (spend.address !== account.address) throw new BrowserError('CONFLICT', '账户地址与派生路径不一致');
      const endpoint = network.rpcUrl.replace(/\/$/, '');
      const [utxoResponse, feeResponse] = await Promise.all([
        networkFetch(`${endpoint}/address/${account.address}/utxo`), networkFetch(`${endpoint}/fee-estimates`),
      ]);
      const utxos = await utxoResponse.json() as Utxo[];
      const estimates = await feeResponse.json() as Record<string, number>;
      const feePerByte = BigInt(Math.max(1, Math.ceil(estimates['6'] ?? estimates['3'] ?? 2)));
      const selected = btc.selectUTXO(utxos.filter((entry) => entry.status.confirmed).map((entry) => ({
        ...spend, txid: entry.txid, index: entry.vout,
        witnessUtxo: { script: spend.script, amount: BigInt(entry.value) },
      })), [{ address: intent.to, amount: amountToBase(intent.value, network.decimals) }], 'default', {
        changeAddress: account.address, feePerByte, bip69: true, createTx: true, network: this.network(network),
      });
      if (!selected?.tx) throw new BrowserError('CONFLICT', '已确认余额不足以支付金额与网络费');
      const fee = formatAmount(selected.fee.toString(), network.decimals);
      return { to: intent.to, value: intent.value, fee, expiresAt: Date.now() + 120000,
        payload: { psbt: Buffer.from(selected.tx.toPSBT()).toString('base64'), paths: ['m/0/0'] } satisfies BitcoinPayload,
        details: { recipient: intent.to, value: `${intent.value} ${network.symbol}`, networkFee: `${fee} ${network.symbol}`, feeRate: `${feePerByte} sat/vB`, changeAddress: account.address } };
    } finally { root.wipePrivateData(); }
  }
  async sign(key: KeyMaterial, network: WalletNetwork, prepared: PreparedTransfer) {
    const payload = prepared.payload as BitcoinPayload;
    const root = this.root(key, network);
    try {
      const transaction = btc.Transaction.fromPSBT(Buffer.from(payload.psbt, 'base64'));
      for (const path of payload.paths) {
        const derived = root.derive(path);
        try { transaction.sign(derived.privateKey!); } finally { derived.wipePrivateData(); }
      }
      transaction.finalize();
      return { payload: transaction.hex, hash: transaction.id };
    } finally { root.wipePrivateData(); }
  }
  async signMessage(): Promise<string> { throw new BrowserError('UNAVAILABLE', 'Bitcoin 消息签名需要明确 BIP-322 协议适配'); }
  async broadcast(network: WalletNetwork, signed: SignedTransfer) {
    const response = await networkFetch(`${network.rpcUrl.replace(/\/$/, '')}/tx`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: signed.payload });
    return (await response.text()).trim();
  }
  async status(network: WalletNetwork, hash: string) {
    try {
      const response = await networkFetch(`${network.rpcUrl.replace(/\/$/, '')}/tx/${encodeURIComponent(hash)}/status`);
      return (await response.json() as { confirmed: boolean }).confirmed ? 'confirmed' as const : 'pending' as const;
    } catch { return 'unknown' as const; }
  }
  dispose() {}
}
