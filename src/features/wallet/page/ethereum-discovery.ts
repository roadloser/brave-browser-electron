import { contextBridge } from 'electron';

export function announceEthereumProvider() {
  contextBridge.executeInMainWorld({
    func: () => {
      const scope = globalThis as typeof globalThis & { ethereum?: { request(input: { method: string; params?: unknown[] }): Promise<unknown> } };
      if (!scope.ethereum) return;
      const info = Object.freeze({
        uuid: crypto.randomUUID(), name: 'Brave Wallet', rdns: 'com.brave.wallet',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="%23fb542b"/><path d="M18 18h28v28H18z" fill="white"/><path d="M26 25h20v14H26z" fill="%23fb542b"/></svg>',
      });
      const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider: scope.ethereum }) }));
      window.addEventListener('eip6963:requestProvider', announce);
      announce();
    },
  });
}
