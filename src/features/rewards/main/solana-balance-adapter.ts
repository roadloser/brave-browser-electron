import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BrowserError } from '../../../shared/errors';

const BAT_MINT = 'EPeUFDgHRxs9xxEPVaL6kfGQvCon7jmAWKVUHuux1Tpz';
const responseSchema = z.object({
  result: z.object({ value: z.array(z.object({
    account: z.object({ data: z.object({ parsed: z.object({ info: z.object({
      mint: z.string(), owner: z.string(),
      tokenAmount: z.object({ amount: z.string().regex(/^\d+$/), decimals: z.number().int().min(0).max(18) }),
    }) }) }) }),
  })) }),
});

export interface RewardsBalanceProviderPort {
  fetch(endpoint: string, address: string, signal: AbortSignal): Promise<string>;
}

export class SolanaBatBalanceAdapter implements RewardsBalanceProviderPort {
  async fetch(endpoint: string, address: string, signal: AbortSignal): Promise<string> {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new BrowserError('INVALID_ARGUMENT', '服务返回的Solana收款地址无效');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) throw new BrowserError('INVALID_ARGUMENT', 'Solana RPC必须使用有效HTTPS地址');
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, redirect: 'error',
      body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'getTokenAccountsByOwner', params: [
        address, { mint: BAT_MINT }, { encoding: 'jsonParsed', commitment: 'confirmed' },
      ] }),
    });
    if (!response.ok) throw new BrowserError('UNAVAILABLE', `Solana RPC返回HTTP ${response.status}`);
    const parsed = responseSchema.parse(await response.json());
    let units = 0n;
    let decimals: number | null = null;
    for (const account of parsed.result.value) {
      const info = account.account.data.parsed.info;
      if (info.mint !== BAT_MINT || info.owner !== address) throw new BrowserError('UNAVAILABLE', 'Solana RPC返回不属于当前账户的token数据');
      if (decimals !== null && decimals !== info.tokenAmount.decimals) throw new BrowserError('UNAVAILABLE', 'Solana RPC返回不一致的精度');
      decimals = info.tokenAmount.decimals;
      units += BigInt(info.tokenAmount.amount);
    }
    if (decimals === null) return '0';
    const digits = units.toString().padStart(decimals + 1, '0');
    const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, '') : '';
    return `${decimals ? digits.slice(0, -decimals) : digits}${fraction ? `.${fraction}` : ''}`;
  }
}
