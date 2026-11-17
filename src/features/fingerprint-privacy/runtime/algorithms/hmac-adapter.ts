import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

export interface FarblingHashPort {
  sign(key: Uint8Array, content: Uint8Array): Uint8Array;
}
export class NobleFarblingHashAdapter implements FarblingHashPort {
  sign(key: Uint8Array, content: Uint8Array): Uint8Array { return hmac(sha256, key, content); }
}
