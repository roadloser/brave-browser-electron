import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash, createHmac } from 'node:crypto';
import { ristretto255_hasher } from '@noble/curves/ed25519.js';
import init, { Token, BatchDLEQProof, PublicKey } from '@brave-intl/challenge-bypass-ristretto-wasm';
import { BrowserError } from '../../../../shared/errors';
import type { SkuPending } from './types';

let initialized: Promise<void> | undefined;
export class SkuCryptoAdapter {
  async initialize(): Promise<void> {
    if (!initialized) initialized = (async () => {
      const require = createRequire(import.meta.url);
      await init({ module_or_path: await readFile(require.resolve('@brave-intl/challenge-bypass-ristretto-wasm/challenge_bypass_ristretto_bg.wasm')) });
    })().catch(error => { initialized = undefined; throw error; });
    return initialized;
  }
  create(count: number): Pick<SkuPending, 'tokens' | 'blinded'> {
    if (!Number.isInteger(count) || count < 1 || count > 5000) throw new BrowserError('UNAVAILABLE', '账户授权批次数量不受支持');
    const tokens: string[] = [];
    const blinded: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const token = Token.random();
      try {
        const encoded = token.encode_base64();
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.length !== 96) throw new BrowserError('UNAVAILABLE', '固定密码依赖的Token格式已变化');
        const scalar = BigInt(`0x${Buffer.from(bytes.subarray(64)).reverse().toString('hex')}`);
        const point = ristretto255_hasher.hashToCurve(bytes.subarray(0, 64), { DST: 'HashToGroup-OPRFV1-\u0000-ristretto255-SHA512' });
        if (point.is0() || scalar === 0n) throw new BrowserError('UNAVAILABLE', '账户授权随机值无效');
        tokens.push(encoded);
        blinded.push(Buffer.from(point.multiply(scalar).toBytes()).toString('base64'));
        bytes.fill(0);
      } finally { token.free(); }
    }
    return { tokens, blinded };
  }
  unblind(pending: SkuPending, response: { blindedCreds: string[]; signedCreds: string[]; batchProof: string; publicKey: string }): string[] {
    const available = new Map(pending.blinded.map((value, index) => [value, pending.tokens[index]]));
    const tokens = response.blindedCreds.map(value => {
      const token = available.get(value);
      if (!token) throw new BrowserError('UNAVAILABLE', '账户授权签名包含未提交或重复的盲值');
      available.delete(value);
      return token;
    });
    if (!tokens.length || tokens.length !== response.signedCreds.length) throw new BrowserError('UNAVAILABLE', '账户授权签名数量不匹配');
    const proof = BatchDLEQProof.decode_base64(response.batchProof);
    const publicKey = PublicKey.decode_base64(response.publicKey);
    try {
      const output = proof.verify_and_unblind_from_encoded(tokens.join(','), response.blindedCreds.join(','), response.signedCreds.join(','), publicKey).split(',');
      if (output.length !== tokens.length || output.some(value => Buffer.from(value, 'base64').length !== 96)) throw new BrowserError('UNAVAILABLE', '账户授权证明输出格式无效');
      return output;
    } catch { throw new BrowserError('UNAVAILABLE', '账户授权盲签证明未通过，未保存凭据'); }
    finally { proof.free(); publicKey.free(); }
  }
  sign(encoded: string, issuer: string, rfc: boolean): { preimage: string; signature: string } {
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length !== 96) throw new BrowserError('STORAGE_FAILED', '账户授权凭据格式无效');
    const preimage = bytes.subarray(0, 64);
    const point = bytes.subarray(64);
    const hash = createHash('sha512');
    if (rfc) hash.update(Buffer.from([0, 64])).update(preimage).update(Buffer.from([0, 32])).update(point).update('Finalize');
    else hash.update('hash_derive_key').update(preimage).update(point);
    const key = hash.digest();
    try { return { preimage: preimage.toString('base64'), signature: createHmac('sha512', key).update(issuer).digest('base64') }; }
    finally { key.fill(0); bytes.fill(0); }
  }
}
