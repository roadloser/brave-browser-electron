import type { WorldPrivacyPolicy } from './world-types';

export function cdpWorldSource(source: string, policy: WorldPrivacyPolicy): string {
  return `(function(){${source};return BraveFingerprintRuntime.install(${JSON.stringify(policy)});})()`;
}
