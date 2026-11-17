import type { BraveFarblingAlgorithms } from './algorithms/brave-algorithms';
import type { WorldPrivacyPolicy } from './world-types';
import { webglStrictParameter } from './brave-webgl-strict-adapter';

const fakeNames = ['texture', 'expanded', 'polygon', 'circle', 'triangle', 'blend', 'draw']
  .flatMap(category => ['sampler', 'compressor', 'blender'].map(suffix => ({
    name: `EXT_${category}_${suffix}`,
    className: `Ext${category[0].toUpperCase()}${category.slice(1)}${suffix[0].toUpperCase()}${suffix.slice(1)}`,
  })));
const webgl2Discard = new Map<number, number>([
  [0x8b4a, 1], [0x8a2b, 2], [0x9122, 3], [0x8b4b, 4], [0x8c8a, 5], [0x8b49, 6],
  [0x8a2d, 7], [0x9125, 8], [0x8a2f, 9], [0x8a2e, 10], [0x8a31, 11], [0x8a33, 12],
]);

export function installBraveWebGL(policy: WorldPrivacyPolicy, algorithms: BraveFarblingAlgorithms): { coveredApis: string[]; failures: string[] } {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  const fake = fakeNames[Number(BigInt(policy.token!.low) % 21n)];
  const constructors = [
    typeof WebGLRenderingContext === 'undefined' ? undefined : WebGLRenderingContext,
    typeof WebGL2RenderingContext === 'undefined' ? undefined : WebGL2RenderingContext,
  ];
  for (const [version, constructor] of constructors.entries()) {
    if (!constructor) continue;
    const prototype = constructor.prototype;
    const supported = prototype.getSupportedExtensions;
    const extension = prototype.getExtension;
    const parameter = prototype.getParameter;
    const extensions = new WeakMap<object, object>();
    try {
      Object.defineProperty(prototype, 'getSupportedExtensions', { configurable: true, writable: true, value: function(this: WebGLRenderingContext) {
        const values = supported.call(this);
        if (!values) return values;
        return policy.mode === 'maximum' ? ['WEBGL_debug_renderer_info'] : policy.webglBalanced ? [...values, fake.name] : values;
      } });
      Object.defineProperty(prototype, 'getExtension', { configurable: true, writable: true, value: function(this: WebGLRenderingContext, name: string) {
        if (policy.mode === 'maximum') return name.toLowerCase() === 'webgl_debug_renderer_info' ? extension.call(this, name) : null;
        if (!policy.webglBalanced || name.toLowerCase() !== fake.name.toLowerCase()) return extension.call(this, name);
        let value = extensions.get(this);
        if (!value) {
          const fakePrototype = Object.create(null) as Record<string | symbol, unknown>;
          Object.defineProperty(fakePrototype, Symbol.toStringTag, { value: fake.className, configurable: false });
          value = Object.create(fakePrototype) as object;
          extensions.set(this, value);
        }
        return value;
      } });
      Object.defineProperty(prototype, 'getParameter', { configurable: true, writable: true, value: function(this: WebGLRenderingContext, name: number) {
        const original = parameter.call(this, name);
        if (policy.mode === 'maximum' && version === 1 && webglStrictParameter(name)) return null;
        if (name === 0x9245 || name === 0x9246) {
          if (original === null) return original;
          return policy.mode === 'maximum' ? algorithms.randomString(name === 0x9245 ? 'UNMASKED_VENDOR_WEBGL' : 'UNMASKED_RENDERER_WEBGL', 8) : policy.webglBalanced ? 'Brave' : original;
        }
        const discard = version === 1 ? webgl2Discard.get(name) : undefined;
        if (discard && typeof original === 'number' && original > 0) {
          if (policy.mode === 'maximum') return null;
          const generator = algorithms.random(); generator.discard(discard);
          return original - Number(generator.next() % 2n);
        }
        return original;
      } });
      coveredApis.push(`WebGL${version + 1}.getSupportedExtensions`, `WebGL${version + 1}.getExtension`, `WebGL${version + 1}.getParameter`);
    } catch { failures.push(`WebGL${version + 1}: descriptor改写失败`); }
  }
  return { coveredApis, failures };
}
