import { z } from 'zod';
import type { ProviderOperation, ProviderToken } from './provider-types';
import { bearer, providerJson } from './provider-http';
import { BrowserError } from '../../../../shared/errors';

export async function prepareUpholdAccount(token: ProviderToken, operation: ProviderOperation): Promise<ProviderToken> {
  const headers = bearer(token.token);
  const user = z.object({ firstName: z.string().optional(), currencies: z.array(z.string()).optional() }).parse(await providerJson(operation, 'https://api.uphold.com/v0/me', { headers }));
  if (user.currencies && !user.currencies.includes('BAT')) throw new BrowserError('FORBIDDEN', '该Uphold账户不支持BAT', false);
  const capabilities = z.array(z.object({ key: z.string(), enabled: z.boolean(), requirements: z.array(z.unknown()) })).parse(await providerJson(operation, 'https://api.uphold.com/v0/me/capabilities', { headers }));
  if (!['receives', 'sends'].every(name => capabilities.some(capability => capability.key === name && capability.enabled && capability.requirements.length === 0))) throw new BrowserError('FORBIDDEN', 'Uphold账户尚未具备所需收发资格', false);
  const cards = z.array(z.object({ id: z.string(), label: z.string().optional() })).parse(await providerJson(operation, 'https://api.uphold.com/v0/me/cards?q=currency:BAT', { headers }));
  let address = cards.find(card => card.label === 'Brave Browser')?.id;
  if (!address) {
    const card = z.object({ id: z.string().min(1) }).parse(await providerJson(operation, 'https://api.uphold.com/v0/me/cards', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Brave Browser', currency: 'BAT' }),
    }));
    address = card.id;
  }
  return { ...token, address, displayName: user.firstName };
}
