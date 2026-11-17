import { createHmac } from 'node:crypto';
import type { FarblingToken } from './token-provider';

export interface PixelFarblingPort {
  perturb(bytes: Uint8Array, token: Pick<FarblingToken, 'high' | 'low'>): Uint8Array;
}

export class BravePixelAlgorithm implements PixelFarblingPort {
  perturb(bytes: Uint8Array, token: Pick<FarblingToken, 'high' | 'low'>): Uint8Array {
    if (!bytes.byteLength) return new Uint8Array(bytes);
    const pixels = Math.floor(bytes.byteLength / 4);
    if (!pixels) return new Uint8Array(bytes);
    const key = Buffer.alloc(16);
    key.writeBigUInt64LE(BigInt(token.high), 0);
    key.writeBigUInt64LE(BigInt(token.low), 8);
    const digest = createHmac('sha256', key).update(bytes).digest();
    const output = new Uint8Array(bytes);
    let state = digest.readBigUInt64LE(0);
    const limit = (1n << 64n) - 1n;
    const mask = 3n << 62n;
    for (const keyByte of digest) {
      let bits = keyByte;
      for (let step = 0; step < 16; step++) {
        if (step % 8 === 0) bits = keyByte;
        const channel = Number(state % 3n);
        const pixel = 4 * Number(state % BigInt(pixels)) + channel;
        output[pixel] ^= bits & 1;
        bits >>= 1;
        state = ((state >> 1n) | (((state << 62n) ^ (state << 61n)) & mask)) & limit;
      }
    }
    key.fill(0); digest.fill(0);
    return output;
  }
}
