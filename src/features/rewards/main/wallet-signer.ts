import { createHash, createPrivateKey, createPublicKey, hkdfSync, sign } from 'node:crypto';
import type { RewardsSignerPort } from './provider-port';
import { BrowserError } from '../../../shared/errors';

const hkdfSalt = Buffer.from([
  126,244,99,158,51,68,253,80,133,183,51,180,77,62,74,252,
  62,106,96,125,241,110,134,87,190,208,158,84,125,69,246,207,
  162,247,107,172,37,34,53,246,105,20,215,5,248,154,179,191,
  46,17,6,72,210,91,10,169,145,248,22,147,117,24,105,12,
]);

export class NodeRewardsSigner implements RewardsSignerPort {
  publicKeyHex(recoverySeed: Uint8Array): string {
    return this.withKey(recoverySeed, key => createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex').toUpperCase());
  }

  headers(seed: Uint8Array, keyId: string, method: string, path: string, content: string): Record<string, string> {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(keyId)) throw new BrowserError('INVALID_ARGUMENT', 'Rewards签名标识无效');
    const digest = `SHA-256=${createHash('sha256').update(content).digest('base64')}`;
    const target = `${method.toLowerCase()} ${path}`;
    const message = `digest: ${digest}\n(request-target): ${target}`;
    const signature = this.withKey(seed, key => sign(null, Buffer.from(message), key).toString('base64'));
    return {
      digest, signature: `keyId="${keyId}",algorithm="ed25519",headers="digest (request-target)",signature="${signature}"`,
      accept: 'application/json',
    };
  }

  private withKey<Value>(seed: Uint8Array, operation: (key: ReturnType<typeof createPrivateKey>) => Value): Value {
    if (seed.length !== 32) throw new BrowserError('INVALID_ARGUMENT', 'Rewards恢复种子长度无效');
    const derived = Buffer.from(hkdfSync('sha512', seed, hkdfSalt, Buffer.from([0]), 32));
    const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), derived]);
    try { return operation(createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })); }
    finally { derived.fill(0); pkcs8.fill(0); }
  }
}
