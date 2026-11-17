import type { Migration, SecretStorePort, StorageHost } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';
import type { VpnConfiguration } from './tunnel-port';

type VpnRecord = { credential: string | null; current: VpnConfiguration | null; previous: VpnConfiguration | null; validated: boolean };
type StoredRow = { credential: string | null; current: string | null; previous: string | null; validated: number };
export const vpnMigrations: Migration[] = [{ id: 'vpn.account-and-configurations', version: 1,
  up: database => database.exec('CREATE TABLE vpn_configuration (id INTEGER PRIMARY KEY CHECK(id=1), credential TEXT, current TEXT, previous TEXT, validated INTEGER NOT NULL DEFAULT 0)'),
}];

export class VpnRepository {
  constructor(private readonly storage: StorageHost, private readonly secrets: SecretStorePort) {}
  get(profileId: string): VpnRecord {
    const row = this.storage.open(profileId).get<StoredRow>('SELECT credential,current,previous,validated FROM vpn_configuration WHERE id=1');
    if (!row) return { credential: null, current: null, previous: null, validated: false };
    try {
      return { credential: row.credential ? this.secrets.decrypt(row.credential) : null,
        current: row.current ? JSON.parse(this.secrets.decrypt(row.current)) as VpnConfiguration : null,
        previous: row.previous ? JSON.parse(this.secrets.decrypt(row.previous)) as VpnConfiguration : null, validated: row.validated === 1 };
    } catch { throw new BrowserError('STORAGE_FAILED', '无法读取加密VPN资料，请确认系统密钥可用'); }
  }
  credential(profileId: string, value: string): void {
    this.available();
    const encrypted = this.secrets.encrypt(value);
    this.storage.open(profileId).run('INSERT INTO vpn_configuration(id,credential,validated) VALUES(1,?,0) ON CONFLICT(id) DO UPDATE SET credential=excluded.credential,validated=0', [encrypted]);
  }
  select(profileId: string, configuration: VpnConfiguration): void {
    this.available();
    const encrypted = this.secrets.encrypt(JSON.stringify(configuration));
    this.storage.open(profileId).run('INSERT INTO vpn_configuration(id,current,validated) VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET previous=vpn_configuration.current,current=excluded.current,validated=1', [encrypted]);
  }
  rollback(profileId: string): void {
    this.storage.open(profileId).run('UPDATE vpn_configuration SET current=previous,previous=current WHERE id=1 AND previous IS NOT NULL');
  }
  forget(profileId: string): void {
    this.storage.open(profileId).run('UPDATE vpn_configuration SET credential=NULL,validated=0 WHERE id=1');
  }
  private available(): void {
    if (!this.secrets.available()) throw new BrowserError('UNAVAILABLE', '系统安全存储不可用，未保存VPN秘密');
  }
}
