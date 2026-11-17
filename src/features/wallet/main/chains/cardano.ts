import * as Cardano from '@emurgo/cardano-serialization-lib-nodejs';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import type { ChainAdapterPort, KeyMaterial, PreparedTransfer, SignedTransfer, TransferIntent } from './adapter';
import { amountToBase, formatAmount } from './network-client';
import { CardanoRpc, type CardanoParameters } from './cardano-rpc';

export class CardanoAdapter implements ChainAdapterPort {
  readonly chain = 'cardano' as const;
  readonly version = 'cardano-serialization-lib-17.0.0/cip1852';
  readonly capability = { chain: this.chain, account: true, transfer: true, messageSign: true, dapp: false, shielded: false,
    reason: 'CIP-30站点协议与账户地址发现仍需完整映射；当前签名为明确原始消息签名' };
  private account(key: KeyMaterial) {
    const entropy = mnemonicToEntropy(key.mnemonic, wordlist);
    try { return Cardano.Bip32PrivateKey.from_bip39_entropy(entropy, new Uint8Array()).derive(0x80000000 + 1852).derive(0x80000000 + 1815).derive(0x80000000 + key.index); }
    finally { entropy.fill(0); }
  }
  async derive(key: KeyMaterial, network: WalletNetwork) {
    const account = this.account(key);
    try {
      const payment = account.derive(0).derive(0).to_raw_key().to_public().hash();
      const stake = account.derive(2).derive(0).to_raw_key().to_public().hash();
      return Cardano.BaseAddress.new(network.testnet ? 0 : 1, Cardano.Credential.from_keyhash(payment), Cardano.Credential.from_keyhash(stake)).to_address().to_bech32();
    } finally { account.free(); }
  }
  async balance(account: WalletAccount, network: WalletNetwork) {
    return (await new CardanoRpc(network).utxos(account.address))
      .reduce((sum, utxo) => sum + BigInt(utxo.amount.find((amount) => amount.unit === 'lovelace')?.quantity ?? 0), 0n).toString();
  }
  async prepare(_key: KeyMaterial, account: WalletAccount, network: WalletNetwork, intent: TransferIntent): Promise<PreparedTransfer> {
    const destination = Cardano.Address.from_bech32(intent.to);
    if (destination.network_id() !== (network.testnet ? 0 : 1)) throw new BrowserError('INVALID_ARGUMENT', 'Cardano 地址与网络不匹配');
    const rpc = new CardanoRpc(network);
    const [utxos, parameters, latest] = await Promise.all([
      rpc.utxos(account.address), rpc.json<CardanoParameters>('epochs/latest/parameters'), rpc.json<{ slot: number }>('blocks/latest'),
    ]);
    const config = Cardano.TransactionBuilderConfigBuilder.new()
      .fee_algo(Cardano.LinearFee.new(Cardano.BigNum.from_str(String(parameters.min_fee_a)), Cardano.BigNum.from_str(String(parameters.min_fee_b))))
      .pool_deposit(Cardano.BigNum.from_str(parameters.pool_deposit)).key_deposit(Cardano.BigNum.from_str(parameters.key_deposit))
      .max_value_size(Number(parameters.max_val_size)).max_tx_size(parameters.max_tx_size)
      .coins_per_utxo_byte(Cardano.BigNum.from_str(parameters.coins_per_utxo_size)).build();
    const builder = Cardano.TransactionBuilder.new(config);
    const inputs = Cardano.TransactionUnspentOutputs.new();
    for (const utxo of utxos) {
      const value = Cardano.Value.new(Cardano.BigNum.from_str(utxo.amount.find((amount) => amount.unit === 'lovelace')?.quantity ?? '0'));
      const assets = Cardano.MultiAsset.new();
      for (const amount of utxo.amount.filter((entry) => entry.unit !== 'lovelace')) {
        assets.set_asset(Cardano.ScriptHash.from_hex(amount.unit.slice(0, 56)), Cardano.AssetName.new(Buffer.from(amount.unit.slice(56), 'hex')), Cardano.BigNum.from_str(amount.quantity));
      }
      if (assets.len()) value.set_multiasset(assets);
      inputs.add(Cardano.TransactionUnspentOutput.new(
        Cardano.TransactionInput.new(Cardano.TransactionHash.from_hex(utxo.tx_hash), utxo.output_index),
        Cardano.TransactionOutput.new(Cardano.Address.from_bech32(utxo.address), value),
      ));
    }
    builder.add_output(Cardano.TransactionOutput.new(destination, Cardano.Value.new(Cardano.BigNum.from_str(amountToBase(intent.value, 6).toString()))));
    builder.set_ttl_bignum(Cardano.BigNum.from_str(String(latest.slot + 1800)));
    builder.add_inputs_from(inputs, Cardano.CoinSelectionStrategyCIP2.LargestFirstMultiAsset);
    builder.add_change_if_needed(Cardano.Address.from_bech32(account.address));
    const body = builder.build();
    const fee = formatAmount(body.fee().to_str(), 6);
    return { to: intent.to, value: intent.value, fee, payload: { body: body.to_hex() }, expiresAt: Date.now() + 120000,
      details: { recipient: intent.to, value: `${intent.value} ADA`, networkFee: `${fee} ADA`, changeAddress: account.address, network: network.name } };
  }
  async sign(key: KeyMaterial, _network: WalletNetwork, prepared: PreparedTransfer) {
    const account = this.account(key);
    try {
      const body = Cardano.TransactionBody.from_hex((prepared.payload as { body: string }).body);
      const fixed = Cardano.FixedTransaction.new_from_body_bytes(body.to_bytes());
      const secret = account.derive(0).derive(0).to_raw_key();
      try { fixed.sign_and_add_vkey_signature(secret); } finally { secret.free(); }
      return { payload: fixed.to_hex(), hash: fixed.transaction_hash().to_hex() };
    } finally { account.free(); }
  }
  async signMessage(key: KeyMaterial, _network: WalletNetwork, message: string) {
    const account = this.account(key);
    const secret = account.derive(0).derive(0).to_raw_key();
    try { return secret.sign(Buffer.from(message, 'utf8')).to_hex(); }
    finally { secret.free(); account.free(); }
  }
  async broadcast(network: WalletNetwork, signed: SignedTransfer) { return new CardanoRpc(network).submit(Buffer.from(signed.payload, 'hex')); }
  async status(network: WalletNetwork, hash: string) {
    try { await new CardanoRpc(network).json(`txs/${encodeURIComponent(hash)}`); return 'confirmed' as const; }
    catch { return 'unknown' as const; }
  }
  dispose() {}
}
