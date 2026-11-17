import type { Migration, ProfileDatabase } from '../../../../shared/runtime-ports';
import type { ExternalAccount } from './provider-types';

export const externalAccountMigrations: readonly Migration[] = [{ id: 'rewards.external-account', version: 1,
  up(database) { database.exec('CREATE TABLE rewards_external_account(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL)'); },
}];
export class ExternalAccountRepository {
  constructor(private readonly database: ProfileDatabase) {}
  get(): ExternalAccount | null {
    const row = this.database.get<{ record: string }>('SELECT record FROM rewards_external_account WHERE id=1');
    return row ? JSON.parse(row.record) as ExternalAccount : null;
  }
  save(record: ExternalAccount): void { this.database.run('INSERT INTO rewards_external_account(id,record) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', [JSON.stringify({ ...record, updatedAt: Date.now() })]); }
  signOut(): void {
    const current = this.get();
    if (current) this.save({ provider: current.provider, status: 'signed-out', updatedAt: Date.now() });
  }
}
