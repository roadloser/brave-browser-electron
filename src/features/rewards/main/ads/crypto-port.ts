export type BlindedTokenBatch = { tokens: string[]; blindedTokens: string[] };
export type SignedTokenBatch = { signedTokens: string[]; batchProof: string; publicKey: string };
export interface AdsTokenCryptoPort {
  initialize(): Promise<void>;
  create(count: number): BlindedTokenBatch;
  verifyAndUnblind(batch: BlindedTokenBatch, signed: SignedTokenBatch): string[];
  credential(unblindedToken: string, payload: string): { tokenPreimage: string; signature: string };
}
