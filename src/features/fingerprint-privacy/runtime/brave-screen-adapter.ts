import type { BraveFarblingAlgorithms } from './algorithms/brave-algorithms';

const screenSizes = [[1280, 800], [1366, 768], [1440, 900], [1680, 1050], [1920, 1080], [2560, 1440], [3840, 2160]];

export function installBraveScreen(algorithms: BraveFarblingAlgorithms): { coveredApis: string[]; failures: string[] } {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (typeof window === 'undefined' || typeof screen === 'undefined') return { coveredApis, failures };
  const offsets = new Map<number, number>();
  const offset = (key: number) => {
    const existing = offsets.get(key);
    if (existing !== undefined) return existing;
    const value = Number(algorithms.random(BigInt(key)).next() % 9n); offsets.set(key, value); return value;
  };
  function patch(target: object, name: string, compute: (original: unknown) => unknown): void {
    let owner: object | null = target;
    let descriptor: PropertyDescriptor | undefined;
    while (owner && !(descriptor = Object.getOwnPropertyDescriptor(owner, name))) owner = Object.getPrototypeOf(owner) as object | null;
    if (!owner || !descriptor?.get || !descriptor.configurable) { failures.push(`Screen.${name}: descriptor不可改写`); return; }
    const getter = descriptor.get;
    Object.defineProperty(owner, name, { ...descriptor, get: function(this: unknown) { return compute(Reflect.apply(getter, this, [])); } });
    coveredApis.push(`Screen.${name}`);
  }
  const topSize = () => {
    try { return [window.top!.innerWidth, window.top!.innerHeight]; }
    catch { throw new DOMException('当前跨来源frame无法取得Brave屏幕策略所需的顶层视口', 'NotSupportedError'); }
  };
  patch(window, 'outerWidth', () => topSize()[0] + offset(1));
  patch(window, 'outerHeight', () => topSize()[1] + offset(2));
  patch(window, 'screenX', () => offset(3));
  patch(window, 'screenY', () => offset(4));
  patch(window, 'screenLeft', () => offset(3));
  patch(window, 'screenTop', () => offset(4));
  const dimensions = () => {
    const [width, height] = topSize();
    return screenSizes.find(size => size[0] >= width + offset(1) && size[1] >= height + offset(2)) ?? screenSizes[screenSizes.length - 1];
  };
  patch(screen, 'width', () => dimensions()[0]); patch(screen, 'height', () => dimensions()[1]);
  patch(screen, 'availWidth', () => dimensions()[0]); patch(screen, 'availHeight', () => dimensions()[1]);
  patch(screen, 'availLeft', () => 0); patch(screen, 'availTop', () => 0); patch(screen, 'isExtended', () => false);
  return { coveredApis, failures };
}
