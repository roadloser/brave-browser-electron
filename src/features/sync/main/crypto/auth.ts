import { createPrivateKey, createPublicKey, hkdfSync, sign } from 'node:crypto';
import { chainEntropy } from './chain-code';

const salt = Buffer.from([72,203,156,43,64,229,225,127,214,158,50,29,130,186,182,207,6,108,47,254,245,71,198,109,44,108,32,193,221,126,119,143,112,113,87,184,239,231,230,234,28,135,54,42,9,243,39,30,179,147,194,211,212,239,225,52,192,219,145,40,95,19,142,98]);
export function signingIdentity(words: string) {
  const derived = Buffer.from(hkdfSync('sha512', chainEntropy(words), salt, 'sync-auth-key', 32));
  const key = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), derived]), format: 'der', type: 'pkcs8' });
  derived.fill(0);
  const publicKey = createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);
  return {
    share: publicKey.toString('hex').toUpperCase(),
    accessToken(timestamp = Date.now()) {
      const time = Buffer.from(String(Math.trunc(timestamp)));
      const signature = sign(null, time, key);
      return Buffer.from([time.toString('hex').toUpperCase(), signature.toString('hex').toUpperCase(), publicKey.toString('hex').toUpperCase()].join('|')).toString('base64');
    },
  };
}
