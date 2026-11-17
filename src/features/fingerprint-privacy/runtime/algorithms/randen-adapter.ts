import { AES_TABLE_0, AES_TABLE_1, AES_TABLE_2, AES_TABLE_3 } from './randen-tables';
import { RANDEN_ROUND_KEY_BYTES } from './randen-keys';
import type { BraveRandenPort } from './randen-port';

const shuffle = [7, 2, 13, 4, 11, 8, 3, 6, 15, 0, 9, 10, 1, 14, 5, 12];
const roundKeys = new Uint32Array(544);
const keyView = new DataView(RANDEN_ROUND_KEY_BYTES.buffer);
for (let index = 0; index < roundKeys.length; index++) roundKeys[index] = keyView.getUint32(index * 4, true);

function aesRound(source: Uint32Array, offset: number, key: Uint32Array, keyOffset: number): Uint32Array {
  const result = new Uint32Array(4);
  for (let column = 0; column < 4; column++) {
    result[column] = key[keyOffset + column]
      ^ AES_TABLE_0[source[offset + column] & 255]
      ^ AES_TABLE_1[(source[offset + (column + 1) % 4] >>> 8) & 255]
      ^ AES_TABLE_2[(source[offset + (column + 2) % 4] >>> 16) & 255]
      ^ AES_TABLE_3[source[offset + (column + 3) % 4] >>> 24];
  }
  return result;
}

export class AbseilRandenAdapter implements BraveRandenPort {
  private readonly state = new Uint32Array(64);
  private nextIndex = 32;

  constructor(seed: bigint) {
    const value = BigInt.asUintN(64, seed);
    for (let index = 4; index < this.state.length; index += 2) {
      this.state[index] = Number(value & 0xffffffffn);
      this.state[index + 1] = Number(value >> 32n);
    }
  }

  next(): bigint {
    if (this.nextIndex >= 32) { this.generate(); this.nextIndex = 2; }
    const index = this.nextIndex++ * 2;
    return BigInt(this.state[index]) | BigInt(this.state[index + 1]) << 32n;
  }

  discard(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Randen discard count invalid');
    for (let index = 0; index < count; index++) this.next();
  }

  private generate(): void {
    const previous = this.state.slice(0, 4);
    let keyOffset = 0;
    for (let round = 0; round < 17; round++) {
      for (let branch = 0; branch < 16; branch += 2) {
        const first = aesRound(this.state, branch * 4, roundKeys, keyOffset);
        keyOffset += 4;
        const second = aesRound(first, 0, this.state, (branch + 1) * 4);
        this.state.set(second, (branch + 1) * 4);
      }
      const original = this.state.slice();
      for (let branch = 0; branch < 16; branch++) this.state.set(original.subarray(shuffle[branch] * 4, shuffle[branch] * 4 + 4), branch * 4);
    }
    for (let index = 0; index < 4; index++) this.state[index] ^= previous[index];
  }
}
