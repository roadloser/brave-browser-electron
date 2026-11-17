import * as Cardano from '@emurgo/cardano-serialization-lib-nodejs';
import { z } from 'zod';
import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import { CardanoRpc, type CardanoUtxo } from './cardano-rpc';
import type { KeyMaterial, PreparedTransfer } from './adapter';
import { cardanoAccountKey } from './cardano-key';
import { formatAmount } from './network-client';

const transactionSchema = z.object({ transaction: z.string().regex(/^(?:[0-9a-f]{2})+$/i).max(500000),
  partialSign: z.boolean().default(false), submitOnly: z.boolean().default(false) }).strict();
function valueOf(utxo: CardanoUtxo) {
  const value = Cardano.Value.new(Cardano.BigNum.from_str(utxo.amount.find((amount) => amount.unit === 'lovelace')?.quantity ?? '0'));
  const assets = Cardano.MultiAsset.new();
  for (const amount of utxo.amount.filter((entry) => entry.unit !== 'lovelace')) {
    assets.set_asset(Cardano.ScriptHash.from_hex(amount.unit.slice(0, 56)), Cardano.AssetName.new(Buffer.from(amount.unit.slice(56), 'hex')), Cardano.BigNum.from_str(amount.quantity));
  }
  if (assets.len()) value.set_multiasset(assets);
  return value;
}
export async function cardanoQuery(account: WalletAccount, network: WalletNetwork, method: string, params: unknown[]) {
  const address = Cardano.Address.from_bech32(account.address);
  if (method === 'getExtensions') return [];
  if (method === 'getNetworkId') return network.testnet ? 0 : 1;
  if (method === 'getUsedAddresses') return [Buffer.from(address.to_bytes()).toString('hex')];
  if (method === 'getUnusedAddresses') return [];
  if (method === 'getChangeAddress') return Buffer.from(address.to_bytes()).toString('hex');
  if (method === 'getRewardAddresses' || method === 'getCollateral') throw new BrowserError('UNAVAILABLE', '当前 Brave Cardano 尚未实现此接口', true, { providerCode: -2 });
  const utxos = (await new CardanoRpc(network).utxos(account.address)).sort((left, right) => left.tx_hash.localeCompare(right.tx_hash) || left.output_index - right.output_index);
  if (method === 'getBalance') {
    let total = Cardano.Value.new(Cardano.BigNum.from_str('0'));
    for (const utxo of utxos) total = total.checked_add(valueOf(utxo));
    return total.to_hex();
  }
  if (method !== 'getUtxos') throw new BrowserError('UNAVAILABLE', '未映射的 Cardano 查询');
  let selected = utxos;
  if (params[0] !== undefined && params[0] !== null) {
    const amount = Cardano.Value.from_hex(z.string().regex(/^(?:[0-9a-f]{2})+$/i).parse(params[0]));
    let total = Cardano.Value.new(Cardano.BigNum.from_str('0'));
    selected = [];
    for (const utxo of utxos) {
      selected.push(utxo); total = total.checked_add(valueOf(utxo));
      const comparison = total.compare(amount);
      if (comparison === 0 || comparison === 1) break;
    }
    const comparison = total.compare(amount);
    if (comparison !== 0 && comparison !== 1) return null;
  }
  if (params[1]) {
    const paginate = z.object({ page: z.number().int().nonnegative(), limit: z.number().int().min(1).max(100) }).parse(params[1]);
    selected = selected.slice(paginate.page * paginate.limit, (paginate.page + 1) * paginate.limit);
  }
  return selected.map((utxo) => Cardano.TransactionUnspentOutput.new(
    Cardano.TransactionInput.new(Cardano.TransactionHash.from_hex(utxo.tx_hash), utxo.output_index),
    Cardano.TransactionOutput.new(Cardano.Address.from_bech32(utxo.address), valueOf(utxo)),
  ).to_hex());
}
export async function prepareCardanoDapp(account: WalletAccount, network: WalletNetwork, input: unknown): Promise<PreparedTransfer> {
  const parsed = transactionSchema.parse(input);
  const fixed = Cardano.FixedTransaction.from_hex(parsed.transaction);
  const body = fixed.body();
  if (body.network_id() && body.network_id()!.kind() !== (network.testnet ? 0 : 1)) throw new BrowserError('CONFLICT', 'Cardano交易网络不匹配');
  if (!parsed.submitOnly) {
    const own = new Set((await new CardanoRpc(network).utxos(account.address)).map((utxo) => `${utxo.tx_hash}:${utxo.output_index}`));
    let ownInputs = 0;
    const inputs = body.inputs();
    for (let index = 0; index < inputs.len(); index++) {
      const item = inputs.get(index);
      const ours = own.has(`${item.transaction_id().to_hex()}:${item.index()}`);
      if (ours) ownInputs++;
      else if (!parsed.partialSign) throw new BrowserError('FORBIDDEN', '完整签名包含当前钱包不拥有的输入；可由站点明确请求部分签名');
    }
    if (!ownInputs) throw new BrowserError('FORBIDDEN', '交易没有当前账户可签名的输入');
  }
  const fee = formatAmount(body.fee().to_str(), 6);
  return { to: 'Cardano 交易输出', value: '0', fee, expiresAt: Date.now() + 120000,
    payload: { transaction: parsed.transaction, witnessOnly: !parsed.submitOnly, submitOnly: parsed.submitOnly },
    details: { network: network.name, networkFee: `${fee} ADA`, transaction: body.to_json(), operation: parsed.submitOnly ? '提交已签名交易' : parsed.partialSign ? '部分签名，返回当前账户见证' : '签署当前账户输入，返回见证' } };
}
export function signCardanoDapp(key: KeyMaterial, prepared: PreparedTransfer) {
  const payload = prepared.payload as { transaction: string; witnessOnly: boolean; submitOnly: boolean };
  const transaction = Cardano.FixedTransaction.from_hex(payload.transaction);
  if (payload.submitOnly) return { payload: payload.transaction, hash: transaction.transaction_hash().to_hex() };
  const account = cardanoAccountKey(key);
  const privateKey = account.derive(0).derive(0).to_raw_key();
  try {
    const witnesses = Cardano.TransactionWitnessSet.new();
    const vkeys = Cardano.Vkeywitnesses.new();
    const existing = transaction.witness_set().vkeys();
    const publicKey = privateKey.to_public().as_bytes();
    let alreadySigned = false;
    for (let index = 0; existing && index < existing.len(); index++) {
      if (Buffer.from(existing.get(index).vkey().public_key().as_bytes()).equals(Buffer.from(publicKey))) alreadySigned = true;
    }
    if (!alreadySigned) vkeys.add(Cardano.make_vkey_witness(transaction.transaction_hash(), privateKey));
    witnesses.set_vkeys(vkeys);
    return { payload: witnesses.to_hex(), hash: transaction.transaction_hash().to_hex() };
  } finally { privateKey.free(); account.free(); }
}
