import { installBraveAudioPolicy } from './brave-audio-adapter';
import type { FramePrivacyPolicy } from './protocol';

export const PRIVACY_CDP_BINDING = '__braveElectronPrivacyContextV1';

export function cdpBootstrapSource(): string {
  return `(() => {
    const binding = globalThis[${JSON.stringify(PRIVACY_CDP_BINDING)}];
    if (typeof binding === 'function') binding(JSON.stringify({ url: globalThis.location?.href ?? '', hasAudioBuffer: typeof AudioBuffer !== 'undefined' }));
  })();`;
}

export function cdpAudioSource(policy: FramePrivacyPolicy): string {
  return `(${installBraveAudioPolicy.toString()})(${JSON.stringify(policy)})`;
}
