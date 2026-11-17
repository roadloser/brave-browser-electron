import { contextBridge, ipcRenderer } from 'electron';

if (process.isMainFrame && location.origin === 'https://account.brave.com') {
  const invoke = async (method: string, argumentsValue: string[]) => {
    const response = await ipcRenderer.invoke('brave:vpn-account', { method, arguments: argumentsValue }) as { ok: boolean; value?: unknown; error?: string };
    if (!response.ok) throw new Error(response.error || '账户授权未完成');
    return response.value;
  };
  contextBridge.exposeInMainWorld('braveVpnAccount', {
    refresh_order: (orderId: string) => invoke('refresh_order', [orderId]),
    fetch_order_credentials: (orderId: string) => invoke('fetch_order_credentials', [orderId]),
    credential_summary: (domain: string) => invoke('credential_summary', [domain]),
    prepare_credentials_presentation: (domain: string, path: string) => invoke('prepare_credentials_presentation', [domain, path]),
  });
  contextBridge.executeInMainWorld({ func: () => {
    const target = window as unknown as { chrome?: Record<string, unknown>; braveVpnAccount: unknown };
    const chrome = target.chrome ?? {};
    if (!target.chrome) Object.defineProperty(target, 'chrome', { value: chrome, configurable: true });
    if (!Object.prototype.hasOwnProperty.call(chrome, 'braveSkus')) Object.defineProperty(chrome, 'braveSkus', { value: target.braveVpnAccount, configurable: false, writable: false });
  } });
}
