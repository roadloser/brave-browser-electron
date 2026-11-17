import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import init, { Token, BatchDLEQProof, PublicKey, UnblindedToken } from '@brave-intl/challenge-bypass-ristretto-wasm';
import type { AdsTokenCryptoPort, BlindedTokenBatch, SignedTokenBatch } from './crypto-port';
import { BrowserError } from '../../../../shared/errors';

let initialized: Promise<void> | undefined;

export class RistrettoWasmAdapter implements AdsTokenCryptoPort {
  async initialize(): Promise<void> {
    if (!initialized) initialized = (async () => {
      const require = createRequire(import.meta.url);
      const wasmPath = require.resolve('@brave-intl/challenge-bypass-ristretto-wasm/challenge_bypass_ristretto_bg.wasm');
      await init({ module_or_path: await readFile(wasmPath) });
    })().catch(error => { initialized = undefined; throw error; });
    return initialized;
  }

  create(count: number): BlindedTokenBatch {
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new BrowserError('INVALID_ARGUMENT', '盲签批次数量无效');
    const batch: BlindedTokenBatch = { tokens: [], blindedTokens: [] };
    for (let index = 0; index < count; index++) {
      const token = Token.random();
      const blinded = token.blind();
      try { batch.tokens.push(token.encode_base64()); batch.blindedTokens.push(blinded.encode_base64()); }
      finally { blinded.free(); token.free(); }
    }
    return batch;
  }

  verifyAndUnblind(batch: BlindedTokenBatch, signed: SignedTokenBatch): string[] {
    if (signed.signedTokens.length !== batch.tokens.length || batch.blindedTokens.length !== batch.tokens.length) throw new BrowserError('UNAVAILABLE', '服务签名token数量不匹配');
    const proof = BatchDLEQProof.decode_base64(signed.batchProof);
    const publicKey = PublicKey.decode_base64(signed.publicKey);
    try {
      const result = proof.verify_and_unblind_from_encoded(batch.tokens.join(','), batch.blindedTokens.join(','), signed.signedTokens.join(','), publicKey).split(',');
      if (result.length !== batch.tokens.length || result.some(token => !token)) throw new BrowserError('UNAVAILABLE', '盲签证明不匹配，未保存任何token');
      return result;
    } finally { proof.free(); publicKey.free(); }
  }

  credential(encoded: string, payload: string) {
    const token = UnblindedToken.decode_base64(encoded);
    const key = token.derive_verification_key_sha512();
    const preimage = token.preimage();
    const signature = key.sign_sha512(Buffer.from(payload));
    try { return { tokenPreimage: preimage.encode_base64(), signature: signature.encode_base64() }; }
    finally { signature.free(); preimage.free(); key.free(); token.free(); }
  }
}
