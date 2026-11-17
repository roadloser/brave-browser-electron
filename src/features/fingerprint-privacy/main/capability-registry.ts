import type { ExecutionContextKind, FingerprintApi, PrivacyCapability } from '../../../shared/contracts/fingerprint-privacy';

const contexts: ExecutionContextKind[] = ['window', 'iframe', 'dedicated-worker', 'shared-worker', 'service-worker', 'worklet'];
const apis: FingerprintApi[] = ['navigator', 'canvas', 'audio', 'webgl', 'fonts', 'screen'];

export function privacyCapabilities(): PrivacyCapability[] {
  return contexts.flatMap(context => apis.map(api => {
    const audioFrame = api === 'audio' && context === 'window';
    const reason = audioFrame
      ? '已按 Brave token 与音频公式接入 AudioBuffer.getChannelData/copyFromChannel；JS覆写可探测，分析器与其余音频输出未覆盖，尚未运行对照'
      : context === 'iframe'
        ? 'Electron有frame preload入口，但StorageKey nonce/credentialless作用域未取得稳定入口，当前不注入'
        : context === 'service-worker'
          ? 'Electron有service-worker preload；主worker token与同步早期初始化尚未建立，不以frame成功推导'
          : context === 'dedicated-worker' || context === 'shared-worker' || context === 'worklet'
            ? '需要固定当前Electron实际CDP/上下文创建时序，尚无完整入口证据'
            : api === 'navigator'
              ? 'Brave使用Abseil Randen PRNG，未采用随机替代；待成熟同算法实现'
              : 'Brave在Blink产出时介入；当前TS页面入口不足以证明相同生成时机和算法覆盖';
    return {
      api, context, status: audioFrame ? 'partial' : 'blocked', implemented: audioFrame, observed: false, reason,
      evidenceId: api === 'audio' ? 'ev_493270e4673e01a32ffd7848deb1ad323fb1286aa9352c7813f6305beb459df9' : undefined,
    } satisfies PrivacyCapability;
  }));
}
