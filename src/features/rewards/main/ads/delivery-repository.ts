import type { Migration, ProfileDatabase } from '../../../../shared/runtime-ports';
import type { AdsCatalog, AdsDeliverySettings, AdsIssuers, AdPlacement, PendingConfirmation, PaymentToken, RedemptionBatch } from './delivery-types';
import type { StoredConfirmationToken } from './token-repository';

export const adsDeliveryMigrations: readonly Migration[] = [{
  id: 'rewards.ads-delivery', version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE rewards_ads_delivery(key TEXT PRIMARY KEY,record TEXT NOT NULL);
      CREATE TABLE rewards_ads_placements(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,record TEXT NOT NULL);
      CREATE TABLE rewards_ads_confirmations(id TEXT PRIMARY KEY,placement_id TEXT NOT NULL,event_type TEXT NOT NULL,record TEXT NOT NULL,UNIQUE(placement_id,event_type));
      CREATE TABLE rewards_ads_payment_tokens(id TEXT PRIMARY KEY,record TEXT NOT NULL,redeemed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE rewards_ads_redemptions(id TEXT PRIMARY KEY,record TEXT NOT NULL);
    `);
  },
}];

export class AdsDeliveryRepository {
  constructor(private readonly database: ProfileDatabase) {}
  settings(): AdsDeliverySettings { return this.read<AdsDeliverySettings>('settings') ?? { enabled: false, maxPerHour: 5 }; }
  configure(settings: AdsDeliverySettings): void { this.write('settings', settings); }
  catalog(): AdsCatalog | null { return this.read<AdsCatalog>('catalog'); }
  issuers(): AdsIssuers | null { return this.read<AdsIssuers>('issuers'); }
  resources(catalog: AdsCatalog, issuers: AdsIssuers, country: string, subdivision: string): void {
    this.database.transaction(() => {
      this.write('catalog', catalog); this.write('issuers', issuers);
      this.configure({ ...this.settings(), country, subdivision, updatedAt: Date.now(), error: undefined });
    });
  }
  place(placement: AdPlacement): void {
    this.database.run('INSERT INTO rewards_ads_placements(id,created_at,record) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', [placement.id, placement.createdAt, JSON.stringify(placement)]);
  }
  placements(): AdPlacement[] { return this.database.all<{ record: string }>('SELECT record FROM rewards_ads_placements ORDER BY created_at DESC').map(row => JSON.parse(row.record) as AdPlacement); }
  confirmation(placementId: string, type: string): PendingConfirmation | null {
    const row = this.database.get<{ record: string }>('SELECT record FROM rewards_ads_confirmations WHERE placement_id=? AND event_type=?', [placementId, type]);
    return row ? JSON.parse(row.record) as PendingConfirmation : null;
  }
  reserve(issuerKeys: string[], build: (token: StoredConfirmationToken) => PendingConfirmation): PendingConfirmation | null {
    return this.database.transaction(() => {
      const row = this.database.all<{ id: string; token_cipher: string; public_key: string }>('SELECT id,token_cipher,public_key FROM rewards_confirmation_tokens WHERE consumed=0 ORDER BY rowid').find(token => issuerKeys.includes(token.public_key));
      if (!row) return null;
      const confirmation = build({ id: row.id, tokenCipher: row.token_cipher, publicKey: row.public_key, consumed: false });
      this.database.run('UPDATE rewards_confirmation_tokens SET consumed=1 WHERE id=?', [row.id]);
      this.saveConfirmation(confirmation);
      return confirmation;
    });
  }
  saveConfirmation(record: PendingConfirmation): void {
    this.database.run('INSERT INTO rewards_ads_confirmations(id,placement_id,event_type,record) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', [record.id, record.placementId, record.type, JSON.stringify(record)]);
  }
  confirmations(): PendingConfirmation[] { return this.database.all<{ record: string }>('SELECT record FROM rewards_ads_confirmations ORDER BY rowid').map(row => JSON.parse(row.record) as PendingConfirmation); }
  payment(confirmation: PendingConfirmation, token: PaymentToken): void {
    this.database.transaction(() => {
      this.database.run('INSERT INTO rewards_ads_payment_tokens(id,record,redeemed) VALUES(?,?,0) ON CONFLICT(id) DO NOTHING', [token.id, JSON.stringify(token)]);
      this.saveConfirmation({ ...confirmation, status: 'complete', error: undefined });
    });
  }
  payments(): PaymentToken[] { return this.database.all<{ record: string }>('SELECT record FROM rewards_ads_payment_tokens WHERE redeemed=0 ORDER BY rowid').map(row => JSON.parse(row.record) as PaymentToken); }
  redemption(): RedemptionBatch | null {
    const row = this.database.get<{ record: string }>('SELECT record FROM rewards_ads_redemptions ORDER BY rowid DESC LIMIT 1');
    return row ? JSON.parse(row.record) as RedemptionBatch : null;
  }
  saveRedemption(batch: RedemptionBatch): void { this.database.run('INSERT INTO rewards_ads_redemptions(id,record) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', [batch.id, JSON.stringify(batch)]); }
  redeemed(batch: RedemptionBatch): void {
    this.database.transaction(() => {
      for (const id of batch.tokenIds) this.database.run('UPDATE rewards_ads_payment_tokens SET redeemed=1 WHERE id=?', [id]);
      this.saveRedemption({ ...batch, status: 'confirmed', error: undefined });
    });
  }
  private read<Value>(key: string): Value | null {
    const row = this.database.get<{ record: string }>('SELECT record FROM rewards_ads_delivery WHERE key=?', [key]);
    return row ? JSON.parse(row.record) as Value : null;
  }
  private write(key: string, value: unknown): void { this.database.run('INSERT INTO rewards_ads_delivery(key,record) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET record=excluded.record', [key, JSON.stringify(value)]); }
}
