import { AbseilRandenAdapter } from './randen-adapter';
import { NobleFarblingHashAdapter, type FarblingHashPort } from './hmac-adapter';
import type { BraveRandenPort } from './randen-port';

export type BraveToken = { high: string; low: string };
const UINT64_MASK = (1n << 64n) - 1n;

export function nextLfsr(value: bigint): bigint {
  return ((value >> 1n) | (((value << 62n) ^ (value << 61n)) & (3n << 62n))) & UINT64_MASK;
}

export class BraveFarblingAlgorithms {
  private readonly tokenBytes = new Uint8Array(16);
  private readonly high: bigint;
  private readonly low: bigint;

  constructor(token: BraveToken, private readonly hash: FarblingHashPort = new NobleFarblingHashAdapter()) {
    this.high = BigInt(token.high); this.low = BigInt(token.low);
    const view = new DataView(this.tokenBytes.buffer);
    view.setBigUint64(0, this.high, true); view.setBigUint64(8, this.low, true);
  }

  random(key = 0n): BraveRandenPort { return new AbseilRandenAdapter(this.high ^ this.low ^ key); }

  pixels(input: Uint8Array): Uint8Array {
    const result = new Uint8Array(input);
    const pixelCount = Math.floor(input.byteLength / 4);
    if (!pixelCount) return result;
    const digest = this.hash.sign(this.tokenBytes, input);
    let state = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getBigUint64(0, true);
    for (const byte of digest) {
      let bits = byte;
      for (let step = 0; step < 16; step++) {
        if (step % 8 === 0) bits = byte;
        result[4 * Number(state % BigInt(pixelCount)) + Number(state % 3n)] ^= bits & 1;
        bits >>= 1; state = nextLfsr(state);
      }
    }
    return result;
  }

  randomString(seed: string, length: number): string {
    const digest = this.hash.sign(this.tokenBytes, new TextEncoder().encode(seed));
    let state = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getBigUint64(0, true);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let index = 0; index < length; index++) { result += alphabet[Number(state % BigInt(alphabet.length))]; state = nextLfsr(state); }
    return result;
  }
}
