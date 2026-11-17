import type { WalletAccount, WalletNetwork, WalletRequest, WalletTransaction } from '../../../shared/contracts/wallet';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';
import type { PreparedTransfer } from './chains/adapter';

export type VaultRecord = { version: 1; salt: string; iv: string; tag: string; ciphertext: string };
export type WalletDocument = {
  vault?: VaultRecord; accounts: WalletAccount[]; networks: WalletNetwork[]; selectedAccountId?: string;
  requests: WalletRequest[]; transactions: WalletTransaction[]; grants: Record<string, string[]>;
  pending: Record<string, { prepared?: PreparedTransfer; message?: string; messageBase64?: string; providerMethod?: string; providerPayload?: unknown }>;
  revision: number;
};
export const walletMigrations: readonly Migration[] = [{
  id: 'wallet', version: 1,
  up(database) { database.exec('CREATE TABLE IF NOT EXISTS wallet_document (id INTEGER PRIMARY KEY CHECK(id = 1), document TEXT NOT NULL)'); },
}];
export class WalletRepository {
  constructor(private readonly database: ProfileDatabase) {}
  read(): WalletDocument | undefined {
    const row = this.database.get<{ document: string }>('SELECT document FROM wallet_document WHERE id = 1');
    return row ? JSON.parse(row.document) as WalletDocument : undefined;
  }
  write(document: WalletDocument) {
    this.database.transaction(() => this.database.run(
      'INSERT INTO wallet_document (id, document) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document', [JSON.stringify(document)],
    ));
  }
}
