import * as Cardano from '@emurgo/cardano-serialization-lib-nodejs';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import type { KeyMaterial } from './adapter';

export function cardanoAccountKey(key: KeyMaterial) {
  const entropy = mnemonicToEntropy(key.mnemonic, wordlist);
  const nodes: Cardano.Bip32PrivateKey[] = [];
  try {
    nodes.push(Cardano.Bip32PrivateKey.from_bip39_entropy(entropy, new Uint8Array()));
    for (const index of [1852, 1815, key.index]) nodes.push(nodes[nodes.length - 1].derive(0x80000000 + index));
    return nodes.pop()!;
  } finally { entropy.fill(0); nodes.forEach((node) => node.free()); }
}
