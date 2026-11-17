import type { BraveFarblingAlgorithms } from './algorithms/brave-algorithms';
import type { WorldPrivacyPolicy } from './world-types';

export function installBravePointer(policy: WorldPrivacyPolicy, algorithms: BraveFarblingAlgorithms): { coveredApis: string[]; failures: string[] } {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (!policy.screenFingerprinting) return { coveredApis, failures };
  const constructors = [
    typeof MouseEvent === 'undefined' ? undefined : MouseEvent,
    typeof PointerEvent === 'undefined' ? undefined : PointerEvent,
  ];
  for (const constructor of constructors) {
    if (!constructor) continue;
    const prototype = constructor.prototype;
    for (const [name, key] of [['screenX', 5n], ['screenY', 6n]] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (!descriptor?.get || descriptor.configurable === false) { failures.push(`Event.${name}: descriptor不可改写`); continue; }
      const getter = descriptor.get;
      Object.defineProperty(prototype, name, {
        ...descriptor,
        get: function(this: MouseEvent | PointerEvent) {
          const original = Reflect.apply(getter, this, []);
          if (!this.view || this.view !== window || policy.mode === 'off') return original;
          const client = name === 'screenX' ? this.clientX : this.clientY;
          const zoom = policy.pageZoom ?? 1;
          const offset = Number(algorithms.random(key).next() % 9n);
          return Math.trunc(Math.trunc(client) * zoom) + offset;
        },
      });
      coveredApis.push(`Screen.${constructor.name}.${name}`);
    }
  }
  failures.push('pointer screen coordinates: 当前使用安装时pageZoom快照；Blink LayoutZoomFactor/DSF和导航内缩放更新未完成对照');
  return { coveredApis, failures };
}
