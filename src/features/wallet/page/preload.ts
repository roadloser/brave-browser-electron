import { contextBridge, ipcRenderer } from 'electron';
import { announceEthereumProvider } from './ethereum-discovery';

if (/^https?:$/.test(location.protocol)) {
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  let previousAccounts = '';
  let previousChain = '';
  const on = (event: string, listener: (value: unknown) => void) => {
    if (!['accountsChanged', 'chainChanged', 'connect', 'disconnect'].includes(event) || typeof listener !== 'function') return;
    const registered = listeners.get(event) ?? new Set();
    registered.add(listener); listeners.set(event, registered);
  };
  const removeListener = (event: string, listener: (value: unknown) => void) => listeners.get(event)?.delete(listener);
  const emit = (event: string, value: unknown) => listeners.get(event)?.forEach((listener) => {
    try { listener(value); } catch {}
  });
  ipcRenderer.on('brave:wallet-provider-state', (_event, state: { ethereumAccounts: string[]; chainId: string; solanaPublicKey: string | null }) => {
    const accounts = JSON.stringify(state.ethereumAccounts);
    if (accounts !== previousAccounts) { previousAccounts = accounts; emit('accountsChanged', state.ethereumAccounts); }
    if (state.chainId !== previousChain) { previousChain = state.chainId; emit('chainChanged', state.chainId); }
  });
  const request = async (chain: 'ethereum' | 'solana', method: string, params: unknown[] = []) => {
    const response = await ipcRenderer.invoke('brave:wallet-provider', { chain, method, params }) as
      { ok: true; value: unknown } | { ok: false; error: { code: number; message: string } };
    if (!response.ok) throw Object.assign(new Error(response.error.message), { code: response.error.code });
    return response.value;
  };
  contextBridge.exposeInMainWorld('ethereum', {
    isBraveWallet: true,
    on,
    removeListener,
    request: (input: { method: string; params?: unknown[] }) => request('ethereum', input.method, input.params),
  });
  announceEthereumProvider();
  contextBridge.exposeInMainWorld('braveSolana', {
    isBraveWallet: true,
    connect: () => request('solana', 'connect'),
    disconnect: () => request('solana', 'disconnect'),
    signMessage: async (message: Uint8Array) => {
      const encoded = btoa(Array.from(message, (byte) => String.fromCharCode(byte)).join(''));
      const result = await request('solana', 'signMessage', [encoded]) as { signature: string; publicKey: string };
      return { publicKey: result.publicKey, signature: Uint8Array.from(atob(result.signature), (character) => character.charCodeAt(0)) };
    },
    signTransaction: (transaction: Uint8Array) => request('solana', 'signTransaction', [{ transaction: btoa(Array.from(transaction, (byte) => String.fromCharCode(byte)).join('')), encoding: 'base64' }]),
    signAndSendTransaction: (transaction: Uint8Array) => request('solana', 'signAndSendTransaction', [{ transaction: btoa(Array.from(transaction, (byte) => String.fromCharCode(byte)).join('')), encoding: 'base64' }]),
  });
}
