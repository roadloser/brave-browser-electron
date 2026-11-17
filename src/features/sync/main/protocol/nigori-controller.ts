import { randomBytes } from 'node:crypto';
import { BrowserError } from '../../../../shared/errors';
import { deriveNigori, importNigori, encryptNigori, decryptNigori, type NigoriKey } from '../crypto/nigori';
import { encodeProto, decodeProto } from './schema';
import type { NigoriSpecifics, Specifics, SyncEntity } from './types';

export class NigoriController {
  private readonly keys = new Map<string, NigoriKey>();
  private defaultKey?: NigoriKey;

  initialize(words: string, entity: SyncEntity): SyncEntity | null {
    const specifics = entity.specifics?.nigori;
    if (!specifics) throw new BrowserError('CONFLICT', '同步服务未提供 Nigori 加密目录');
    if (specifics.encryption_keybag?.blob) {
      if (specifics.passphrase_type !== 4) throw new BrowserError('UNAVAILABLE', '此同步链尚未使用 Brave 自定义密码加密模式，不能自动更改已有密钥');
      const derived = deriveNigori(words, specifics.custom_passphrase_key_derivation_method ?? 0, specifics.custom_passphrase_key_derivation_salt);
      const keybag = decodeProto<{ key?: Array<{ encryption_key: Buffer; mac_key: Buffer; deprecated_user_key?: Buffer }> }>('NigoriKeyBag', decryptNigori(derived, specifics.encryption_keybag));
      this.keys.set(derived.name, derived);
      for (const entry of keybag.key ?? []) {
        const key = importNigori(entry.encryption_key, entry.mac_key, entry.deprecated_user_key);
        this.keys.set(key.name, key);
      }
      this.defaultKey = this.keys.get(specifics.encryption_keybag.key_name);
      if (!this.defaultKey) throw new BrowserError('CONFLICT', '同步链默认密钥缺失');
      return null;
    }
    const salt = randomBytes(32).toString('base64');
    const key = deriveNigori(words, 2, salt);
    this.keys.set(key.name, key); this.defaultKey = key;
    const keybag = encodeProto('NigoriKeyBag', { key: [{ deprecated_name: key.name, deprecated_user_key: key.userKey, encryption_key: key.encryptionKey, mac_key: key.macKey }] });
    const updated: NigoriSpecifics = {
      encryption_keybag: encryptNigori(key, keybag), keybag_is_frozen: true, encrypt_everything: true,
      passphrase_type: 4, custom_passphrase_key_derivation_method: 2,
      custom_passphrase_key_derivation_salt: salt, custom_passphrase_time: String(Date.now()),
    };
    return { ...entity, specifics: { nigori: updated } };
  }
  encrypt(specifics: Specifics, field: string): Specifics {
    if (!this.defaultKey) throw new BrowserError('UNAVAILABLE', '同步密钥尚未建立');
    return { [field]: {}, encrypted: encryptNigori(this.defaultKey, encodeProto('EntitySpecifics', specifics)) };
  }
  decrypt(specifics: Specifics): Specifics {
    if (!specifics.encrypted) return specifics;
    const key = this.keys.get(specifics.encrypted.key_name);
    if (!key) throw new BrowserError('CONFLICT', '远端数据使用未知同步密钥');
    return decodeProto<Specifics>('EntitySpecifics', decryptNigori(key, specifics.encrypted));
  }
  dispose(): void {
    for (const key of this.keys.values()) { key.encryptionKey.fill(0); key.macKey.fill(0); key.userKey.fill(0); }
    this.keys.clear(); this.defaultKey = undefined;
  }
}
