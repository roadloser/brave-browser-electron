import type { WorldPrivacyPolicy } from './world-types';

export function installBraveHitTests(policy: WorldPrivacyPolicy): { coveredApis: string[]; failures: string[] } {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (policy.mode !== 'maximum') return { coveredApis, failures };
  for (const name of ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']) {
    const constructor = (globalThis as unknown as Record<string, { prototype?: object }>)[name];
    if (!constructor?.prototype) continue;
    for (const method of ['isPointInPath', 'isPointInStroke']) {
      let prototype: object | null = constructor.prototype;
      let descriptor: PropertyDescriptor | undefined;
      while (prototype && !(descriptor = Object.getOwnPropertyDescriptor(prototype, method))) prototype = Object.getPrototypeOf(prototype) as object | null;
      if (!prototype || !descriptor?.configurable || typeof descriptor.value !== 'function') { failures.push(`${name}.${method}: descriptor不可改写`); continue; }
      Object.defineProperty(prototype, method, { ...descriptor, value: function() { return false; } });
      coveredApis.push(`Canvas.${name}.${method}`);
    }
  }
  return { coveredApis, failures };
}
