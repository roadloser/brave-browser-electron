import { createHash } from 'node:crypto';
import type { SecretStorePort } from '../../../../shared/runtime-ports';
import type { SyncLocalItem } from '../../../../shared/sync-data-ports';
import { BrowserError } from '../../../../shared/errors';
import { decodeProto, encodeProto } from './schema';
import { unixMillis, windowsMicros } from './data-mapping';
import type { SyncEntity } from './types';

export type PasswordData = Record<string, unknown> & {
 scheme?: number; signon_realm?: string; origin?: string; username_element?: string; username_value?: string;
 password_element?: string; password_value?: string; date_created?: string; blacklisted?: boolean; federation_url?: string;
 date_password_modified_windows_epoch_micros?: string;
};
function escapePath(value: string): string {
  const reserved = new Set([32,34,35,37,58,60,62,63,91,92,93,94,96,123,124,125]);
  return [...Buffer.from(value)].map(byte => byte < 32 || byte >= 127 || reserved.has(byte) ? '%' + byte.toString(16).toUpperCase().padStart(2, '0') : String.fromCharCode(byte)).join('');
}
export function passwordTag(data: PasswordData): string {
  return [data.origin ?? '', data.username_element ?? '', data.username_value ?? '', data.password_element ?? '', data.signon_realm ?? ''].map(escapePath).join('|');
}
export function passwordToData(item: Extract<SyncLocalItem, { type: 'passwords' }>, secrets: SecretStorePort): { data: PasswordData; raw: Buffer; tag: string } {
  const value = item.value;
  const previous = value.encryptedSyncMetadata ? Buffer.from(secrets.decrypt(value.encryptedSyncMetadata), 'base64') : Buffer.alloc(0);
  const preserved = previous.length ? decodeProto<PasswordData>('PasswordSpecificsData', previous) : {};
  const data: PasswordData = {
    ...preserved, scheme: 0, signon_realm: preserved.signon_realm ?? value.origin + '/',
    origin: preserved.origin ?? value.origin + '/', username_value: value.username,
    password_value: secrets.decrypt(value.encryptedPassword),
    date_created: windowsMicros(value.createdAt), date_password_modified_windows_epoch_micros: windowsMicros(value.updatedAt),
  };
  const overrides = encodeProto('PasswordSpecificsData', {
    scheme: data.scheme, signon_realm: data.signon_realm, origin: data.origin,
    username_value: data.username_value, password_value: data.password_value,
    date_created: data.date_created, date_password_modified_windows_epoch_micros: data.date_password_modified_windows_epoch_micros,
  });
  return { data, raw: Buffer.concat([previous, overrides]), tag: passwordTag(data) };
}
export function passwordFromData(raw: Buffer, entity: SyncEntity, secrets: SecretStorePort): SyncLocalItem | null {
  const data = decodeProto<PasswordData>('PasswordSpecificsData', raw);
  if ((data.scheme ?? 0) !== 0 || data.blacklisted || data.federation_url) throw new BrowserError('UNAVAILABLE', '远端密码包含当前凭据库未支持的认证类型，已保留同步游标等待兼容映射');
  if (!data.origin || typeof data.password_value !== 'string') throw new BrowserError('CONFLICT', '远端密码记录缺少来源或密码');
  const origin = new URL(data.origin).origin;
  if (!origin.startsWith('https://') && !origin.startsWith('http://')) throw new BrowserError('UNAVAILABLE', '远端凭据不是Web登录密码');
  const id = createHash('sha256').update(passwordTag(data)).digest('hex');
  return { type: 'passwords', id, value: {
    origin, username: data.username_value ?? '',
    encryptedPassword: secrets.encrypt(data.password_value),
    encryptedSyncMetadata: secrets.encrypt(raw.toString('base64')),
    createdAt: data.date_created ? unixMillis(data.date_created) : Number(entity.ctime ?? Date.now()),
    updatedAt: data.date_password_modified_windows_epoch_micros ? unixMillis(data.date_password_modified_windows_epoch_micros) : Number(entity.mtime ?? Date.now()),
  } };
}
