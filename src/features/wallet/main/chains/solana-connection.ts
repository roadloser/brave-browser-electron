import { Connection } from '@solana/web3.js';
import { walletFetch } from '../context-network';

export function solanaConnection(url: string) {
  return new Connection(url, {
    commitment: 'confirmed',
    fetch: (input, init) => walletFetch(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init as RequestInit),
  });
}
