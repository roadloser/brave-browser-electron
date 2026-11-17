import type { Migration, SecretStorePort, StorageHost } from '../../../../shared/runtime-ports';
import { BrowserError } from '../../../../shared/errors';
import type { SkuDocument } from './types';

export const vpnAccountMigrations: Migration[] = [
  { id: 'vpn.skus-account', version: 1, up: database => database.exec('CREATE TABLE vpn_skus_account (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL); ALTER TABLE vpn_configuration ADD COLUMN expires_at INTEGER;') },
];

export class SkuRepository {
  constructor(private readonly storage: StorageHost, private readonly secrets: SecretStorePort) {}
  load(profileId: string): SkuDocument {
    const row = this.storage.open(profileId).get<{ document: string }>('SELECT document FROM vpn_skus_account WHERE id=1');
    if (!row) return { orders: {} };
    try { return JSON.parse(this.secrets.decrypt(row.document)) as SkuDocument; }
    catch { throw new BrowserError('STORAGE_FAILED', '账户授权资料无法解密，请重新登录'); }
  }
  update<Value>(profileId: string, operation: (document: SkuDocument) => Value): Value {
    if (!this.secrets.available()) throw new BrowserError('UNAVAILABLE', '系统安全存储不可用，未保存账户授权');
    return this.storage.open(profileId).transaction(() => {
      const document = this.load(profileId);
      const result = operation(document);
      const encoded = JSON.stringify(document);
      if (encoded.length > 8_000_000) throw new BrowserError('STORAGE_FAILED', '账户授权资料超出支持大小');
      this.storage.open(profileId).run('INSERT INTO vpn_skus_account(id,document) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document', [this.secrets.encrypt(encoded)]);
      return result;
    });
  }
  clear(profileId: string): void { this.storage.open(profileId).run('DELETE FROM vpn_skus_account'); }
}
