import type { ExecutionContextKind, FingerprintApi, PrivacyCapability } from '../../../shared/contracts/fingerprint-privacy';

const contexts: ExecutionContextKind[] = ['window', 'iframe', 'dedicated-worker', 'shared-worker', 'service-worker', 'worklet'];
const apis: FingerprintApi[] = ['navigator', 'canvas', 'audio', 'webgl', 'fonts', 'screen'];

export function privacyCapabilities(): PrivacyCapability[] {
  return contexts.flatMap(context => apis.map(api => {
    const audioFrame = api === 'audio' && context === 'window';
    const canvasFrame = api === 'canvas' && context === 'window';
    const reason = audioFrame
      ? '已按 Brave token 与音频公式接入 AudioBuffer.getChannelData/copyFromChannel；JS覆写可探测，分析器与其余音频输出未覆盖，尚未运行对照'
      : canvasFrame ? '已接Brave HMAC-SHA256/LFSR像素算法，覆盖主frame 2D读像素及HTML/Offscreen导出；JS可探测/颜色空间与跨上下文未完成，未运行对照'
      : context === 'iframe'
        ? '已接固定CDP真实StorageKey与Audio两API；nonce尚未映射FastHash，首读时序未观察，运行状态按当前标签报告'
        : context === 'service-worker'
          ? '已接Target自动附加/真实StorageKey/最终恢复；AudioBuffer不一定存在，其他worker API尚未实现'
          : context === 'dedicated-worker' || context === 'shared-worker' || context === 'worklet'
            ? context === 'worklet' ? 'Worklet未提供与Target worker相同覆盖保证，不推导已接入' : '已接固定CDP Target自动附加/StorageKey/finally恢复；目标API与首次读取未观察'
            : api === 'navigator'
              ? 'Brave使用Abseil Randen PRNG，未采用随机替代；待成熟同算法实现'
              : 'Brave在Blink产出时介入；当前TS页面入口不足以证明相同生成时机和算法覆盖';
    return {
      api, context, status: audioFrame || canvasFrame ? 'partial' : 'blocked', implemented: audioFrame || canvasFrame, observed: false, reason,
      evidenceId: api === 'audio' ? 'ev_493270e4673e01a32ffd7848deb1ad323fb1286aa9352c7813f6305beb459df9' : undefined,
    } satisfies PrivacyCapability;
  }));
}
