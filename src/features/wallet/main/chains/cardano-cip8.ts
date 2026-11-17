import * as Cardano from '@emurgo/cardano-serialization-lib-nodejs';
import * as Cose from '@emurgo/cardano-message-signing-nodejs';
import type { KeyMaterial } from './adapter';
import type { WalletNetwork } from '../../../../shared/contracts/wallet';
import { cardanoAccountKey } from './cardano-key';

export function signCardanoData(key: KeyMaterial, network: WalletNetwork, bytes: Uint8Array): string {
  const account = cardanoAccountKey(key);
  const payment = account.derive(0).derive(0).to_raw_key();
  const stake = account.derive(2).derive(0).to_raw_key();
  try {
    const publicKey = payment.to_public();
    const address = Cardano.BaseAddress.new(network.testnet ? 0 : 1,
      Cardano.Credential.from_keyhash(publicKey.hash()), Cardano.Credential.from_keyhash(stake.to_public().hash())).to_address();
    const protectedHeaders = Cose.HeaderMap.new();
    protectedHeaders.set_algorithm_id(Cose.Label.from_algorithm_id(Cose.AlgorithmId.EdDSA));
    protectedHeaders.set_header(Cose.Label.new_text('address'), Cose.CBORValue.new_bytes(address.to_bytes()));
    const headers = Cose.Headers.new(Cose.ProtectedHeaderMap.new(protectedHeaders), Cose.HeaderMap.new());
    const builder = Cose.COSESign1Builder.new(headers, bytes, false);
    const signature = payment.sign(builder.make_data_to_sign().to_bytes()).to_bytes();
    const coseKey = Cose.COSEKey.new(Cose.Label.from_key_type(Cose.KeyType.OKP));
    coseKey.set_algorithm_id(Cose.Label.from_algorithm_id(Cose.AlgorithmId.EdDSA));
    coseKey.set_header(Cose.Label.new_int(Cose.Int.new_i32(-1)), Cose.CBORValue.new_int(Cose.Int.new_i32(6)));
    coseKey.set_header(Cose.Label.new_int(Cose.Int.new_i32(-2)), Cose.CBORValue.new_bytes(publicKey.as_bytes()));
    return JSON.stringify({ signature: Buffer.from(builder.build(signature).to_bytes()).toString('hex'), key: Buffer.from(coseKey.to_bytes()).toString('hex') });
  } finally { payment.free(); stake.free(); account.free(); }
}
