import { FetchRequest, JsonRpcProvider } from 'ethers';
import { walletFetch } from '../context-network';

export function ethereumProvider(url: string) {
  const transport = new FetchRequest(url);
  transport.getUrlFunc = async (request, signal) => {
    const controller = new AbortController();
    signal?.addListener(() => controller.abort());
    const response = await walletFetch(request.url, {
      method: request.method, headers: request.headers,
      body: request.body ? Buffer.from(request.body) : undefined, signal: controller.signal,
    });
    return {
      statusCode: response.status, statusMessage: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: new Uint8Array(await response.arrayBuffer()),
    };
  };
  return new JsonRpcProvider(transport);
}
