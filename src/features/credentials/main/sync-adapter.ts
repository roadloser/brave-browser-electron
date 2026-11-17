import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncDataAdapter } from '../../../shared/sync-data-ports';
import { BrowserError } from '../../../shared/errors';
import type { VaultService } from './vault-service';
import { CredentialRepository } from './credential-repository';

export function createCredentialSyncAdapter(runtime: FeatureRuntime, service: VaultService): SyncDataAdapter {
  const repository = new CredentialRepository(runtime.storage);
  return {
    snapshot(profileId) {
      return repository.list(profileId).map(entry => ({
        type: 'passwords', id: entry.id,
        value: { origin: entry.origin, username: entry.username, encryptedPassword: entry.encryptedPassword, encryptedSyncMetadata: entry.encryptedSyncMetadata, createdAt: entry.createdAt, updatedAt: entry.updatedAt },
      }));
    },
    apply(profileId, changes) {
      for (const change of changes) {
        if (change.operation === 'delete') { if (change.type === 'passwords') repository.remove(profileId, change.id); continue; }
        if (change.item.type !== 'passwords') continue;
        const value = change.item.value;
        const origin = new URL(value.origin);
        if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value.origin) throw new BrowserError('INVALID_ARGUMENT', '同步密码来源无效');
        runtime.secrets.decrypt(value.encryptedPassword);
        const existing = repository.list(profileId).find(entry => entry.origin === value.origin && entry.username === value.username && entry.id !== change.item.id);
        if (existing) throw new BrowserError('CONFLICT', '同一来源和用户名已存在其他密码记录，请先处理合并');
        runtime.storage.open(profileId).run(
          'INSERT INTO credentials(id,origin,username,encrypted_password,encrypted_sync_metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET origin=excluded.origin,username=excluded.username,encrypted_password=excluded.encrypted_password,encrypted_sync_metadata=excluded.encrypted_sync_metadata,updated_at=excluded.updated_at',
          [change.item.id, value.origin, value.username, value.encryptedPassword, value.encryptedSyncMetadata ?? null, value.createdAt, value.updatedAt],
        );
      }
    },
    notify(profileId) { service.notifyImported(profileId); },
    subscribe(listener) { return service.subscribe(listener); },
  };
}
