import type { RewardsState } from '../../../../shared/contracts/rewards';
import type { ExternalAccount } from './provider-types';

export function externalAccountState(state: RewardsState, account: ExternalAccount | null): RewardsState {
  const capabilities = state.capabilities.filter(item => !['其他外部账户连接', '其他余额', '托管收款账户'].includes(item.operation));
  const result: RewardsState = { ...state, capabilities: [...capabilities,
    { operation: '托管收款账户', status: 'implemented', reason: 'Uphold、bitFlyer、ZebPay官方OAuth/claim与BAT余额客户端；须合法服务资格，尚未运行观察' },
  ] };
  if (!account) return result;
  result.externalAccount = { provider: account.provider, status: account.status, displayName: account.displayName, address: account.address, error: account.error, balance: account.balance ?? null, balanceAt: account.balanceAt ?? null };
  if (account.status === 'connected') {
    result.provider = account.provider; result.linked = true;
    result.account = { status: 'connected', provider: account.provider };
    result.balance = { amount: account.balance ?? null, currency: 'BAT', status: account.balance === undefined ? 'unknown' : 'confirmed', updatedAt: account.balanceAt ?? null };
  }
  return result;
}
