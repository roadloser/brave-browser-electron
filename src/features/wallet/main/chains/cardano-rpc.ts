import type { WalletNetwork } from '../../../../shared/contracts/wallet';
import { networkFetch } from './network-client';
import { BrowserError } from '../../../../shared/errors';

export type CardanoUtxo = { tx_hash: string; output_index: number; address: string; amount: { unit: string; quantity: string }[] };
export type CardanoParameters = { min_fee_a: number; min_fee_b: number; key_deposit: string; pool_deposit: string; max_tx_size: number; max_val_size: string | number; coins_per_utxo_size: string };
export class CardanoRpc {
  constructor(private readonly network: WalletNetwork) {}
  async json<Result>(path: string): Promise<Result> {
    const response = await networkFetch(this.url(path), { headers: this.headers() });
    return response.json() as Promise<Result>;
  }
  async utxos(address: string) {
    const records: CardanoUtxo[] = [];
    const seen = new Set<string>();
    for (let page = 1; ; page++) {
      let batch: CardanoUtxo[];
      try { batch = await this.json<CardanoUtxo[]>(`addresses/${encodeURIComponent(address)}/utxos?count=100&page=${page}`); }
      catch (error) {
        if (error instanceof BrowserError && error.details?.status === 404) return records;
        throw error;
      }
      if (!Array.isArray(batch)) throw new BrowserError('UNAVAILABLE', 'Cardano UTXO响应格式无效');
      for (const utxo of batch) {
        const id = `${utxo.tx_hash}:${utxo.output_index}`;
        if (seen.has(id)) throw new BrowserError('UNAVAILABLE', 'Cardano分页重复，未把不完整结果视为余额');
        seen.add(id);
      }
      records.push(...batch);
      if (batch.length < 100) return records;
    }
  }
  async submit(bytes: Uint8Array) {
    const response = await networkFetch(this.url('tx/submit'), { method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/cbor' }, body: Buffer.from(bytes) });
    return response.json() as Promise<string>;
  }
  private url(path: string) { return `${this.network.rpcUrl.replace(/\/$/, '')}/${path}`; }
  private headers(): Record<string, string> {
    const key = process.env[this.network.testnet ? 'CARDANO_TESTNET_PROJECT_ID' : 'CARDANO_MAINNET_PROJECT_ID'];
    return key ? { project_id: key } : {};
  }
}
