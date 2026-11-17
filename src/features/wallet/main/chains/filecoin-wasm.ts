import { createRequire } from 'node:module';

type FilecoinExtendedKey = { address: string; private_raw: Uint8Array; free(): void };
export type FilecoinMessage = { To: string; From: string; Nonce: number; Value: string; GasLimit: number; GasFeeCap: string; GasPremium: string; Method: number; Params: string };
type FilecoinWasm = {
  keyDerive(mnemonic: string, path: string, password: string, language?: string): FilecoinExtendedKey;
  keyRecover(privateKey: Uint8Array, testnet: boolean): FilecoinExtendedKey;
  transactionSignLotus(message: FilecoinMessage, privateKey: Uint8Array): { Message: FilecoinMessage; Signature: { Type: number; Data: string } };
};
let loaded: FilecoinWasm | undefined;
export function filecoinWasm(): FilecoinWasm {
  if (!loaded) loaded = createRequire(import.meta.url)('@zondax/filecoin-signing-tools/nodejs/filecoin_signer_wasm.js') as FilecoinWasm;
  return loaded;
}
