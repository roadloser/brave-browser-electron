import { safeStorage } from 'electron';
import { BrowserError } from '../../../shared/errors';

export class SecretStore {
  available(): boolean {
    return safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  }

  encrypt(plaintext: string): string {
    if (!this.available()) throw new BrowserError('UNAVAILABLE', '系统安全存储不可用，无法保存秘密');
    return safeStorage.encryptString(plaintext).toString('base64');
  }

  decrypt(ciphertext: string): string {
    if (!this.available()) throw new BrowserError('UNAVAILABLE', '系统安全存储不可用，无法读取秘密');
    try { return safeStorage.decryptString(Buffer.from(ciphertext, 'base64')); }
    catch { throw new BrowserError('UNAVAILABLE', '秘密无法解密，请解锁系统钥匙串后重试'); }
  }
}
