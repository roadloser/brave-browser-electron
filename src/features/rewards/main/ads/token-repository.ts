import type { Migration, ProfileDatabase } from '../../../../shared/runtime-ports';
import type { BlindedTokenBatch } from './crypto-port';

export type AdsTokenConfiguration = { endpoint: string; issuerPublicKeys: string[] };
export type PendingTokenBatch = {
  id: string; batchCipher: string; nonce: string | null; status: 'requesting' | 'awaiting-signature' | 'failed';
  error?: string; createdAt: number; captchaId?: string;
};
export type StoredConfirmationToken = { id: string; tokenCipher: string; publicKey: string; consumed: boolean };
export const adsTokenMigrations: readonly Migration[] = [{
  id: 'rewards.ads-confirmation-tokens', version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE rewards_ads_configuration(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL);
      CREATE TABLE rewards_ads_batches(id TEXT PRIMARY KEY,record TEXT NOT NULL);
      CREATE TABLE rewards_confirmation_tokens(id TEXT PRIMARY KEY,token_cipher TEXT NOT NULL,public_key TEXT NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
    `);
  },
}];

export class AdsTokenRepository {
  constructor(private readonly database: ProfileDatabase) {}
  configuration(): AdsTokenConfiguration | null {
    const row = this.database.get<{ record: string }>('SELECT record FROM rewards_ads_configuration WHERE id=1');
    return row ? JSON.parse(row.record) as AdsTokenConfiguration : null;
  }
  configure(value: AdsTokenConfiguration): void { this.database.run('INSERT INTO rewards_ads_configuration(id,record) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', [JSON.stringify(value)]); }
  pending(): PendingTokenBatch | null {
    const row = this.database.get<{ record: string }>('SELECT record FROM rewards_ads_batches ORDER BY rowid DESC LIMIT 1');
    return row ? JSON.parse(row.record) as PendingTokenBatch : null;
  }
  saveBatch(batch: PendingTokenBatch): void { this.database.run('INSERT INTO rewards_ads_batches(id,record) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', [batch.id, JSON.stringify(batch)]); }
  commit(batchId: string, tokens: StoredConfirmationToken[]): void {
    this.database.transaction(() => {
      for (const token of tokens) this.database.run('INSERT INTO rewards_confirmation_tokens(id,token_cipher,public_key,consumed) VALUES(?,?,?,0)', [token.id, token.tokenCipher, token.publicKey]);
      this.database.run('DELETE FROM rewards_ads_batches WHERE id=?', [batchId]);
    });
  }
  count(): number { return this.database.get<{ count: number }>('SELECT COUNT(*) AS count FROM rewards_confirmation_tokens WHERE consumed=0')?.count ?? 0; }
}

export type { BlindedTokenBatch };
