import { randomBytes } from 'node:crypto';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { BrowserError } from '../../../../shared/errors';
import type { SyncCode } from '../../../../shared/contracts/sync';

const epoch = Date.UTC(2022, 4, 10);
const day = 86400000;
export function createChainWords(): string { return entropyToMnemonic(randomBytes(32), wordlist); }
export function chainEntropy(words: string): Uint8Array {
  if (words.split(' ').length !== 24 || !validateMnemonic(words, wordlist)) throw new BrowserError('INVALID_ARGUMENT', '同步链密钥无效');
  return mnemonicToEntropy(words, wordlist);
}
export function parseChainCode(code: string, now = Date.now()): string {
  const words = code.toLowerCase().trim().split(/\s+/);
  if (words.length !== 25) throw new BrowserError('INVALID_ARGUMENT', '请输入 Brave 当前提供的 25 个同步代码单词');
  const pure = words.slice(0, 24).join(' ');
  chainEntropy(pure);
  const currentDay = Math.round((now - epoch) / day) % 2048;
  const encodedDay = wordlist.indexOf(words[24]);
  if (encodedDay < 0 || Math.abs(currentDay - encodedDay) > 1) throw new BrowserError('INVALID_ARGUMENT', '同步代码已过期或设备时间不一致，请在另一台设备重新获取');
  return pure;
}
export function displayChainCode(words: string, now = Date.now()): SyncCode {
  chainEntropy(words);
  const roundedDay = Math.round((now - epoch) / day);
  return { code: words + ' ' + wordlist[roundedDay % 2048], expiresAt: epoch + (roundedDay % 2048 === 2047 ? roundedDay + 0.5 : roundedDay + 1.5) * day };
}
