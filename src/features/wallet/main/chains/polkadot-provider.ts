import { ApiPromise, HttpProvider } from '@polkadot/api';
import { walletFetch } from '../context-network';

class ContextHttpProvider extends HttpProvider {
  constructor(private readonly endpoint: string) { super(endpoint); }
  override async send<Result>(method: string, params: unknown[], _cacheable?: boolean): Promise<Result> {
    const response = await walletFetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }) });
    const payload = await response.json() as { result?: Result; error?: { code: number; message: string } };
    if (!response.ok || payload.error || payload.result === undefined) throw new Error(`Polkadot节点请求失败（${payload.error?.code ?? response.status}）`);
    return payload.result;
  }
  override clone() { return new ContextHttpProvider(this.endpoint); }
}

export function polkadotProvider(url: string) {
  return ApiPromise.create({ provider: new ContextHttpProvider(url), noInitWarn: true });
}
