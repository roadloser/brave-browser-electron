import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import * as btc from '@scure/btc-signer';
import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import type { ChainAdapterPort, KeyMaterial, PreparedTransfer, SignedTransfer, TransferIntent } from './adapter';
import { amountToBase, formatAmount, networkFetch } from './network-client';
import { discoverBitcoin, type BitcoinDiscovery, type BitcoinPublicAccount } from './bitcoin-discovery';

type Utxo = { txid: string; vout: number; value: number; status: { confirmed: boolean } };
type BitcoinPayload = { psbt: string; paths: string[] };

export class BitcoinAdapter implements ChainAdapterPort {
  readonly chain = 'bitcoin' as const;
  readonly version = 'scure-btc-signer-2.4.1/bip84';
  readonly capability = { chain: this.chain, account: true, transfer: true, messageSign: false, dapp: false, shielded: false,
    reason: '接收/找零采用 gap 20 地址发现；BIP-322 与站点 PSBT 待接入' };
  private readonly discovered = new Map<string, BitcoinDiscovery>();
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
  async initializeDiscovery(key: KeyMaterial, network: WalletNetwork): Promise<BitcoinPublicAccount> {
    const root = this.root(key, network);
    try { return { version: 1, xpub: root.publicExtendedKey, nextReceiveIndex: 0, nextChangeIndex: 0, lastScannedAt: null }; }
    finally { root.wipePrivateData(); }
  }
  async discover(account: WalletAccount, network: WalletNetwork, state: BitcoinPublicAccount, signal?: AbortSignal) {
    const result = await discoverBitcoin(state, network, signal);
    this.discovered.set(account.id, result);
    return result;
  }
  async balance(account: WalletAccount, _network: WalletNetwork) {
    const discovered = this.discovered.get(account.id);
    if (!discovered) throw new BrowserError('UNAVAILABLE', '先完成账户地址发现再读取余额');
    return discovered.balance;
  }
  async prepare(key: KeyMaterial, account: WalletAccount, network: WalletNetwork, intent: TransferIntent): Promise<PreparedTransfer> {
    const root = this.root(key, network);
    try {
      const discovered = this.discovered.get(account.id);
      if (!discovered || Date.now() - (discovered.state.lastScannedAt ?? 0) > 60000) throw new BrowserError('CONFLICT', '地址发现数据已过期，请刷新后重试');
      const endpoint = network.rpcUrl.replace(/\/$/, '');
      const feeResponse = await networkFetch(`${endpoint}/fee-estimates`);
      const estimates = await feeResponse.json() as Record<string, number>;
      const feePerByte = BigInt(Math.max(1, Math.ceil(estimates['6'] ?? estimates['3'] ?? 2)));
      const inputs: Array<{ txid: string; index: number; witnessUtxo: { script: Uint8Array; amount: bigint } }> = [];
      for (const address of discovered.addresses.filter((entry) => entry.used)) {
        const response = await networkFetch(`${endpoint}/address/${address.address}/utxo`);
        const utxos = await response.json() as Utxo[];
        for (const utxo of utxos.filter((entry) => entry.status.confirmed)) {
          inputs.push({ txid: utxo.txid, index: utxo.vout, witnessUtxo: { script: address.script, amount: BigInt(utxo.value) } });
        }
      }
      const selected = btc.selectUTXO(inputs, [{ address: intent.to, amount: amountToBase(intent.value, network.decimals) }], 'default', {
        changeAddress: discovered.changeAddress, feePerByte, bip69: true, createTx: true, network: this.network(network),
      });
      if (!selected?.tx) throw new BrowserError('CONFLICT', '已确认余额不足以支付金额与网络费');
      const paths = new Set<string>();
      for (let index = 0; index < selected.tx.inputsLength; index++) {
        const script = selected.tx.getInput(index).witnessUtxo?.script;
        const address = discovered.addresses.find((entry) => script && Buffer.from(entry.script).equals(Buffer.from(script)));
        if (!address) throw new BrowserError('CONFLICT', '选中的UTXO不属于当前账户');
        paths.add(`m/${address.branch}/${address.index}`);
      }
      const fee = formatAmount(selected.fee.toString(), network.decimals);
      return { to: intent.to, value: intent.value, fee, expiresAt: Date.now() + 120000,
        payload: { psbt: Buffer.from(selected.tx.toPSBT()).toString('base64'), paths: [...paths] } satisfies BitcoinPayload,
        details: { recipient: intent.to, value: `${intent.value} ${network.symbol}`, networkFee: `${fee} ${network.symbol}`, feeRate: `${feePerByte} sat/vB`, changeAddress: discovered.changeAddress } };
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
  dispose() { this.discovered.clear(); }
}
