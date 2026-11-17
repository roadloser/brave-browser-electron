import { z } from 'zod';
import type { RewardsProviderName } from '../../../../shared/contracts/rewards';
import type { ProviderOperation, ProviderToken } from './provider-types';
import { bearer, providerJson } from './provider-http';
import { BrowserError } from '../../../../shared/errors';

const amountSchema = z.union([z.string().regex(/^\d+(?:\.\d+)?$/), z.number().finite().nonnegative()]);
export async function providerBalance(provider: RewardsProviderName, account: ProviderToken, operation: ProviderOperation): Promise<string> {
  const headers = bearer(account.token);
  if (provider === 'uphold') {
    const value = z.object({ available: amountSchema }).parse(await providerJson(operation, `https://api.uphold.com/v0/me/cards/${encodeURIComponent(account.address!)}`, { headers }));
    return String(value.available);
  }
  if (provider === 'zebpay') {
    const value = z.object({ BAT: amountSchema }).parse(await providerJson(operation, 'https://brave.zebpay.com/api/balance', { headers }));
    return String(value.BAT);
  }
  const value = z.object({ inventory: z.array(z.object({ currency_code: z.string(), available: amountSchema })) }).parse(await providerJson(operation, 'https://bitflyer.com/api/link/v1/account/inventory', { headers }));
  const balance = value.inventory.find(item => item.currency_code === 'BAT');
  if (!balance) throw new BrowserError('UNAVAILABLE', 'bitFlyer未返回BAT余额，未将缺失数据视为0');
  return String(balance.available);
}
