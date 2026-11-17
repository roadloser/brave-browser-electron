import type { WorldPrivacyPolicy } from './world-types';

export function installBraveTextMetrics(policy: WorldPrivacyPolicy): { coveredApis: string[]; failures: string[] } {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (policy.mode !== 'maximum' || typeof CanvasRenderingContext2D === 'undefined') return { coveredApis, failures };
  const prototype = CanvasRenderingContext2D.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'measureText');
  if (!descriptor?.value || descriptor.configurable === false) {
    failures.push('CanvasRenderingContext2D.measureText: descriptor不可改写');
    return { coveredApis, failures };
  }
  const original = descriptor.value as (this: CanvasRenderingContext2D, text: string) => TextMetrics;
  Object.defineProperty(prototype, 'measureText', {
    ...descriptor,
    value: function(this: CanvasRenderingContext2D, ...args: [string]) {
      Reflect.apply(original, this, args);
      const empty = original.call(this, '');
      return new Proxy(empty, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          return typeof value === 'number' ? 0 : typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  });
  coveredApis.push('Canvas.measureText');
  failures.push('严格measureText使用原生空对象+数值零代理，扩展TextMetrics方法及原生brand细节未完成对照');
  return { coveredApis, failures };
}
