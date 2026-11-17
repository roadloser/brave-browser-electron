import { contextBridge } from 'electron';

type CardanoRequest = (method: string, params?: unknown[], accountId?: string) => Promise<unknown>;
export function exposeCardanoProvider(request: CardanoRequest) {
  const call = async (method: string, params: unknown[] = [], accountId?: string) => {
    try { return await request(method, params, accountId); }
    catch (error) {
      const failure = error as { code?: number; message?: string };
      const code = failure.code && failure.code < 0 ? failure.code :
        failure.code === 4001 ? method === 'signData' ? 3 : method === 'signTx' ? 2 : -3 :
        failure.code === 4100 ? -3 : -2;
      throw { code, info: failure.message ?? 'Cardano 钱包请求失败' };
    }
  };
  contextBridge.exposeInMainWorld('braveCardano', {
      name: 'Brave Wallet', apiVersion: '1', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%23fb542b"/></svg>',
      supportedExtensions: [],
      isEnabled: () => call('isEnabled'),
      enable: async () => {
        const result = await call('enable') as { accountId: string };
        const accountId = result.accountId;
        return {
          getExtensions: () => call('getExtensions', [], accountId),
          getNetworkId: () => call('getNetworkId', [], accountId),
          getUtxos: (amount?: string, paginate?: { page: number; limit: number }) => call('getUtxos', [amount, paginate], accountId),
          getBalance: () => call('getBalance', [], accountId),
          getUsedAddresses: () => call('getUsedAddresses', [], accountId),
          getUnusedAddresses: () => call('getUnusedAddresses', [], accountId),
          getChangeAddress: () => call('getChangeAddress', [], accountId),
          getRewardAddresses: () => call('getRewardAddresses', [], accountId),
          getCollateral: (params?: { amount: string }) => call('getCollateral', [params?.amount], accountId),
          signTx: (transaction: string, partialSign = false) => call('signTx', [transaction, partialSign], accountId),
          signData: (address: string, payload: string) => call('signData', [address, payload], accountId),
          submitTx: (transaction: string) => call('submitTx', [transaction], accountId),
        };
      },
  });
  contextBridge.executeInMainWorld({ func: () => {
    const scope = globalThis as typeof globalThis & { cardano?: Record<string, unknown>; braveCardano: unknown };
    scope.cardano ??= {};
    if (!scope.cardano.brave) Object.defineProperty(scope.cardano, 'brave', { value: scope.braveCardano, enumerable: true });
  } });
}
