import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { BrowserError } from '../../../shared/errors';
import type { VaultRecord } from './wallet-repository';

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
export class Keyring {
  private mnemonic: Buffer | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly onLock: () => void) {}
  get unlocked() { return this.mnemonic !== null; }
  async create(password: string, imported?: string): Promise<VaultRecord> {
    const mnemonic = imported?.normalize('NFKD').trim().split(/\s+/).join(' ') ?? generateMnemonic(wordlist, 256);
    if (!validateMnemonic(mnemonic, wordlist)) throw new BrowserError('INVALID_ARGUMENT', '助记词无效，请核对英语单词和顺序');
    const salt = randomBytes(32);
    const iv = randomBytes(12);
    const key = await derivePassword(password, salt);
    try {
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(mnemonic, 'utf8'), cipher.final()]);
      this.setMnemonic(mnemonic);
      return { version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
    } finally { key.fill(0); }
  }
  async unlock(password: string, vault: VaultRecord) {
    const mnemonic = await this.decrypt(password, vault);
    this.setMnemonic(mnemonic);
  }
  async authenticate(password: string, vault: VaultRecord) { return this.decrypt(password, vault); }
  use<Result>(operation: (mnemonic: string) => Result): Result {
    if (!this.mnemonic) throw new BrowserError('FORBIDDEN', '请先解锁钱包');
    this.scheduleLock();
    return operation(this.mnemonic.toString('utf8'));
  }
  lock() {
    clearTimeout(this.timer);
    this.mnemonic?.fill(0); this.mnemonic = null;
    this.onLock();
  }
  dispose() { clearTimeout(this.timer); this.mnemonic?.fill(0); this.mnemonic = null; }
  private setMnemonic(mnemonic: string) {
    this.mnemonic?.fill(0); this.mnemonic = Buffer.from(mnemonic, 'utf8'); this.scheduleLock();
  }
  private scheduleLock() { clearTimeout(this.timer); this.timer = setTimeout(() => this.lock(), 5 * 60 * 1000); }
  private async decrypt(password: string, vault: VaultRecord) {
    if (vault.version !== 1) throw new BrowserError('UNAVAILABLE', '钱包加密格式版本不受支持');
    const key = await derivePassword(password, Buffer.from(vault.salt, 'base64'));
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(vault.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(vault.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(vault.ciphertext, 'base64')), decipher.final()]).toString('utf8');
    } catch { throw new BrowserError('FORBIDDEN', '钱包密码不正确或加密数据已损坏'); }
    finally { key.fill(0); }
  }
}
