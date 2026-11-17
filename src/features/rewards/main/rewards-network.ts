import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';

export type RewardsFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
export function contextRewardsFetch(runtime: FeatureRuntime, context: BrowserContext): RewardsFetch {
  if (context.isPrivate || context.kind === 'tor') throw new BrowserError('FORBIDDEN', 'Rewards只在普通资料中运行');
  return (input, init) => runtime.network.fetch(context, String(input), { ...init, credentials: 'omit', redirect: 'error', purpose: 'rewards' });
}
