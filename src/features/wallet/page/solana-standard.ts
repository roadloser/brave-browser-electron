import { contextBridge } from 'electron';

export function exposeSolanaStandard() {
  contextBridge.executeInMainWorld({
    func: () => {
      type PublicAccount = { address: string; publicKey: Uint8Array; chains: string[]; features: string[] };
      type Bridge = {
        connect(): Promise<{ publicKey: string; publicKeyBytes: Uint8Array; chain: string }>;
        disconnect(): Promise<unknown>;
        signMessage(bytes: Uint8Array): Promise<{ signature: Uint8Array; publicKey: string }>;
        signTransaction(bytes: Uint8Array): Promise<{ transaction: string }>;
        signAndSendTransaction(bytes: Uint8Array): Promise<{ signature: string; signatureBytes: Uint8Array }>;
        onAccountChange(callback: (state: { address: string | null; publicKey: Uint8Array | null; chain: string }) => void): void;
      };
      const bridge = (globalThis as typeof globalThis & { braveSolana: Bridge }).braveSolana;
      const listeners = new Set<(properties: { accounts: PublicAccount[] }) => void>();
      let accounts: PublicAccount[] = [];
      const update = (address: string | null, publicKey: Uint8Array | null, chain: string) => {
        accounts = address && publicKey ? [Object.freeze({ address, publicKey, chains: [chain],
          features: ['solana:signMessage', 'solana:signTransaction', 'solana:signAndSendTransaction'] })] : [];
        listeners.forEach((listener) => listener({ accounts }));
      };
      const assertAccount = (account: PublicAccount, chain?: string) => {
        if (!accounts[0] || accounts[0].address !== account.address) throw new Error('账户未连接或已改变');
        if (chain && !accounts[0].chains.includes(chain)) throw new Error('请在钱包中切换至请求的 Solana 网络');
      };
      const decode = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
      const wallet = Object.freeze({
        version: '1.0.0',
        name: 'Brave Wallet',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%23fb542b"/></svg>',
        chains: ['solana:mainnet', 'solana:devnet', 'solana:testnet'],
        get accounts() { return accounts; },
        features: {
          'standard:connect': { version: '1.0.0', connect: async () => {
            const result = await bridge.connect(); update(result.publicKey, result.publicKeyBytes, result.chain); return { accounts };
          } },
          'standard:disconnect': { version: '1.0.0', disconnect: async () => { await bridge.disconnect(); update(null, null, 'solana:mainnet'); } },
          'standard:events': { version: '1.0.0', on: (event: string, callback: (properties: { accounts: PublicAccount[] }) => void) => {
            if (event !== 'change') throw new Error('未知钱包事件');
            listeners.add(callback); return () => listeners.delete(callback);
          } },
          'solana:signMessage': { version: '1.0.0', signMessage: async (...inputs: Array<{ account: PublicAccount; message: Uint8Array }>) => {
            const outputs = [];
            for (const input of inputs) { assertAccount(input.account); const result = await bridge.signMessage(input.message); outputs.push({ signedMessage: input.message, signature: result.signature }); }
            return outputs;
          } },
          'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signTransaction: async (...inputs: Array<{ account: PublicAccount; transaction: Uint8Array; chain?: string }>) => {
            const outputs = [];
            for (const input of inputs) { assertAccount(input.account, input.chain); const result = await bridge.signTransaction(input.transaction); outputs.push({ signedTransaction: decode(result.transaction) }); }
            return outputs;
          } },
          'solana:signAndSendTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signAndSendTransaction: async (...inputs: Array<{ account: PublicAccount; transaction: Uint8Array; chain: string }>) => {
            const outputs = [];
            for (const input of inputs) { assertAccount(input.account, input.chain); const result = await bridge.signAndSendTransaction(input.transaction); outputs.push({ signature: result.signatureBytes }); }
            return outputs;
          } },
        },
      });
      bridge.onAccountChange((state) => update(state.address, state.publicKey, state.chain));
      const register = (api: { register(...wallets: unknown[]): void }) => api.register(wallet);
      window.addEventListener('wallet-standard:app-ready', (event) => register((event as CustomEvent).detail));
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
    },
  });
}
