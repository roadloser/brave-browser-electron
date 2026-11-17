import type { BraveFarblingAlgorithms } from './algorithms/brave-algorithms';
import type { WorldPrivacyPolicy } from './world-types';

export function installBraveNavigator(policy: WorldPrivacyPolicy, algorithms: BraveFarblingAlgorithms): { coveredApis: string[]; failures: string[] } {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (typeof navigator === 'undefined') return { coveredApis, failures };
  const originalPrototype = Object.getPrototypeOf(navigator) as object;
  function patch(name: string, calculate: (original: unknown) => unknown) {
    let prototype: object | null = originalPrototype;
    let descriptor: PropertyDescriptor | undefined;
    while (prototype && !(descriptor = Object.getOwnPropertyDescriptor(prototype, name))) prototype = Object.getPrototypeOf(prototype) as object | null;
    if (!prototype || !descriptor?.get || !descriptor.configurable) { failures.push(`navigator.${name}: descriptor不可改写`); return; }
    const getter = descriptor.get;
    Object.defineProperty(prototype, name, { ...descriptor, get: function(this: unknown) { return calculate(Reflect.apply(getter, this, [])); } });
    coveredApis.push(`navigator.${name}`);
  }
  patch('hardwareConcurrency', original => {
    const actual = policy.hardwareConcurrency ?? Number(original);
    if (actual < 4) return actual;
    const maximum = policy.mode === 'maximum' ? 8 : actual;
    return 4 + Number(algorithms.random().next() % BigInt(maximum + 1 - 4));
  });
  patch('deviceMemory', original => {
    const values = [2, 4, 8, 16, 32];
    if (policy.mode === 'maximum') return values[Number(algorithms.random().next() % 5n)];
    const found = values.indexOf(Number(original));
    const maximum = found < 0 ? values.length - 1 : found;
    if (maximum <= 1) return 4;
    return values[1 + Number(algorithms.random().next() % BigInt(maximum))];
  });
  patch('languages', original => policy.mode === 'maximum' ? Object.freeze(['en-US', 'en']) : Object.freeze(Array.isArray(original) ? original.slice(0, 1) : []));
  patch('language', original => policy.mode === 'maximum' ? 'en-US' : original);
  if (policy.mode === 'maximum') patch('userAgent', original => `${String(original)}${' '.repeat(Number(algorithms.random().next() % 5n))}`);
  return { coveredApis, failures };
}
