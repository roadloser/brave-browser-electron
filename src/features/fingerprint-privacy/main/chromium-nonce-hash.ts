const mask = (1n << 64n) - 1n;
const cityConstant = 0x9ae16a3b2f90404fn;
const truncate = (value: bigint) => value & mask;
const rotate = (value: bigint, shift: bigint) => truncate((value >> shift) | (value << (64n - shift)));

export function chromiumNonceHash(nonce: { high: string; low: string }): bigint {
  const high = BigInt(nonce.high);
  const low = BigInt(nonce.low);
  const multiplier = truncate(cityConstant + 32n);
  const first = truncate(high + cityConstant);
  const second = low;
  const mixedFirst = truncate(truncate(rotate(second, 37n) * multiplier) + first);
  const mixedSecond = truncate(truncate(rotate(first, 25n) + second) * multiplier);
  let left = truncate((mixedFirst ^ mixedSecond) * multiplier);
  left ^= left >> 47n;
  let right = truncate((mixedSecond ^ left) * multiplier);
  right ^= right >> 47n;
  return truncate(right * multiplier);
}
