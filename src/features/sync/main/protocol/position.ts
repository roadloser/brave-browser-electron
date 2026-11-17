import { inflateSync } from 'node:zlib';
import { BrowserError } from '../../../../shared/errors';

export function positionBytes(value: Record<string, unknown> | undefined): Buffer {
  if (!value) return Buffer.alloc(0);
  if (value.value instanceof Uint8Array) return Buffer.from(value.value);
  if (value.compressed_value instanceof Uint8Array) return inflateSync(value.compressed_value, { maxOutputLength: 1024 * 1024 });
  if (!(value.custom_compressed_v1 instanceof Uint8Array)) return Buffer.alloc(0);
  const encoded = Buffer.from(value.custom_compressed_v1);
  const blocks: Buffer[] = [];
  let total = 0;
  for (let offset = 0; offset < encoded.length;) {
    const available = encoded.length - offset;
    const repeated = available >= 4 && encoded[offset] === encoded[offset + 1] && encoded[offset] === encoded[offset + 2] && encoded[offset] === encoded[offset + 3];
    if (repeated) {
      if (available < 8) throw new BrowserError('CONFLICT', '书签位置编码不完整');
      const packed = encoded.readUInt32BE(offset + 4);
      const count = packed >= 0x80000000 ? 0xffffffff - packed : packed;
      total += count;
      if (count < 4 || total > 1024 * 1024) throw new BrowserError('CONFLICT', '书签位置编码超过限制');
      blocks.push(Buffer.alloc(count, encoded[offset])); offset += 8;
    } else {
      const count = Math.min(8, available); total += count;
      blocks.push(encoded.subarray(offset, offset + count)); offset += count;
    }
  }
  return Buffer.concat(blocks);
}
