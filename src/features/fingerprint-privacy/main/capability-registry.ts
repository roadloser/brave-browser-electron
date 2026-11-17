import type { ExecutionContextKind, FingerprintApi, PrivacyCapability } from '../../../shared/contracts/fingerprint-privacy';

const contexts: ExecutionContextKind[] = ['window', 'iframe', 'dedicated-worker', 'shared-worker', 'service-worker', 'worklet'];
const apis: FingerprintApi[] = ['navigator', 'canvas', 'audio', 'webgl', 'fonts', 'screen'];
const reasons: Record<FingerprintApi, string> = {
  audio: 'AudioBuffer两API与Analyser四API已映射Brave系数/LFSR；频域由公开dB值反算存在精度差异，未运行对照',
  canvas: 'HMAC-SHA256/LFSR像素公式已映射读像素/导出与严格hit-test；颜色空间、SkPixmap格式和worker首读未运行对照',
  navigator: '固定Abseil Randen映射hardwareConcurrency/deviceMemory，语言与严格UA；UA-CH/属性可探测性仍有差异',
  webgl: '真实feature默认与严格debug字符串/扩展、WebGL2参数已局部映射；全部严格GL API禁止尚未完成',
  fonts: 'Brave在本地font availability与font fallback解析介入；网页属性覆写不能代替布局层完整名单/随机准入',
  screen: 'Randen整数偏移和固定screen尺寸已映射；跨来源顶层viewport/多屏/PointerEvents仍需完整接入',
};

export function privacyCapabilities(): PrivacyCapability[] {
  return contexts.flatMap(context => apis.map(api => {
    const worker = ['dedicated-worker', 'shared-worker', 'service-worker'].includes(context);
    const absent = (worker && (api === 'audio' || api === 'screen')) || (context === 'worklet' && api !== 'canvas');
    if (absent) return {
      api, context, status: 'not-applicable', implemented: false, observed: false,
      reason: '固定Chromium150 WebIDL未向此执行上下文暴露该API族；不把不存在的API记为阻塞或成功',
    } satisfies PrivacyCapability;
    const implemented = api !== 'fonts' && context !== 'worklet';
    return {
      api, context, status: implemented ? 'partial' : 'blocked', implemented, observed: false,
      reason: context === 'worklet' ? 'Paint仅严格isPointInPath/isPointInStroke两API已准备；owner scope与主线程Paint首读仍需闭合' : reasons[api],
      evidenceId: api === 'audio' ? 'ev_493270e4673e01a32ffd7848deb1ad323fb1286aa9352c7813f6305beb459df9' : undefined,
    } satisfies PrivacyCapability;
  }));
}
