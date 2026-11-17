import { contextBridge, ipcRenderer } from 'electron';

if (/^https?:$/.test(location.protocol)) {
  const request = async (chain: 'ethereum' | 'solana', method: string, params: unknown[] = []) => {
    const response = await ipcRenderer.invoke('brave:wallet-provider', { chain, method, params }) as
      { ok: true; value: unknown } | { ok: false; error: { code: number; message: string } };
    if (!response.ok) throw Object.assign(new Error(response.error.message), { code: response.error.code });
    return response.value;
  };
  contextBridge.exposeInMainWorld('ethereum', {
    isBraveWallet: true,
    request: (input: { method: string; params?: unknown[] }) => request('ethereum', input.method, input.params),
  });
  contextBridge.exposeInMainWorld('braveSolana', {
    isBraveWallet: true,
    connect: () => request('solana', 'connect'),
    disconnect: () => request('solana', 'disconnect'),
    signMessage: async (message: Uint8Array) => {
      const encoded = btoa(Array.from(message, (byte) => String.fromCharCode(byte)).join(''));
      const result = await request('solana', 'signMessage', [encoded]) as { signature: string; publicKey: string };
      return { publicKey: result.publicKey, signature: Uint8Array.from(atob(result.signature), (character) => character.charCodeAt(0)) };
    },
  });
}
