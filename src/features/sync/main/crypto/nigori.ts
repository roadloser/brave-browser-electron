import { createCipheriv, createDecipheriv, createHmac, pbkdf2Sync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { BrowserError } from '../../../../shared/errors';

export type NigoriKey = { name: string; userKey: Buffer; encryptionKey: Buffer; macKey: Buffer };
export type EncryptedData = { key_name: string; blob: string };
const salt = Buffer.from('c7cafb23ec2a9d4c035a90aeed8ba498', 'hex');

function cbcEncrypt(key: Buffer, iv: Buffer, value: Uint8Array): Buffer {
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(value), cipher.final()]);
}
function keyName(encryptionKey: Buffer, macKey: Buffer): string {
  const prefix = Buffer.alloc(12);
  prefix.writeUInt32BE(4, 0); prefix.writeUInt32BE(1, 4); prefix.writeUInt32BE(10, 8);
  const encrypted = cbcEncrypt(encryptionKey, Buffer.alloc(16), Buffer.concat([prefix, Buffer.from('nigori-key')]));
  return Buffer.concat([encrypted, createHmac('sha256', macKey).update(encrypted).digest()]).toString('base64');
}
export function importNigori(encryptionKey: Uint8Array, macKey: Uint8Array, userKey = new Uint8Array(16)): NigoriKey {
  if (encryptionKey.length !== 16 || macKey.length !== 16) throw new BrowserError('INVALID_ARGUMENT', '同步加密密钥长度无效');
  const encryption = Buffer.from(encryptionKey); const mac = Buffer.from(macKey);
  return { name: keyName(encryption, mac), encryptionKey: encryption, macKey: mac, userKey: Buffer.from(userKey) };
}
export function deriveNigori(words: string, method: number, derivationSalt?: string): NigoriKey {
  if (method === 0 || method === 1) {
    return importNigori(pbkdf2Sync(words, salt, 1003, 16, 'sha1'), pbkdf2Sync(words, salt, 1004, 16, 'sha1'), pbkdf2Sync(words, salt, 1002, 16, 'sha1'));
  }
  if (method !== 2 || !derivationSalt) throw new BrowserError('UNAVAILABLE', '此同步链使用尚未支持的加密派生方式');
  const result = scryptSync(words, Buffer.from(derivationSalt, 'base64'), 32, { N: 8192, r: 8, p: 11, maxmem: 32 * 1024 * 1024 });
  const key = importNigori(result.subarray(0, 16), result.subarray(16));
  result.fill(0);
  return key;
}
export function encryptNigori(key: NigoriKey, value: Uint8Array): EncryptedData {
  const iv = randomBytes(16);
  const encrypted = cbcEncrypt(key.encryptionKey, iv, value);
  const mac = createHmac('sha256', key.macKey).update(encrypted).digest();
  return { key_name: key.name, blob: Buffer.concat([iv, encrypted, mac]).toString('base64') };
}
export function decryptNigori(key: NigoriKey, data: EncryptedData): Buffer {
  const packed = Buffer.from(data.blob, 'base64');
  if (data.key_name !== key.name || packed.length < 64 || (packed.length - 48) % 16) throw new BrowserError('CONFLICT', '同步数据密钥不匹配或密文无效');
  const ciphertext = packed.subarray(16, -32);
  const calculated = createHmac('sha256', key.macKey).update(ciphertext).digest();
  if (!timingSafeEqual(calculated, packed.subarray(-32))) throw new BrowserError('CONFLICT', '同步数据完整性校验失败');
  try {
    const decipher = createDecipheriv('aes-128-cbc', key.encryptionKey, packed.subarray(0, 16));
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch { throw new BrowserError('CONFLICT', '同步数据解密失败'); }
}
