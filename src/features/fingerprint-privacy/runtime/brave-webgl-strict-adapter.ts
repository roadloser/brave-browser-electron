import type { WorldPrivacyPolicy } from './world-types';

const nullMethods = [
  'getActiveAttrib', 'getActiveUniform', 'getAttachedShaders', 'getBufferParameter',
  'getFramebufferAttachmentParameter', 'getRenderbufferParameter', 'getTexParameter',
  'getUniform', 'getUniformLocation', 'getVertexAttrib',
];
const emptyMethods = ['getProgramInfoLog', 'getShaderInfoLog', 'getShaderSource'];
const strictParameters = new Set([
  0x8b8c, 0x1f02, 0x8f36, 0x8f37, 0x8ca6,
  0x8b4a, 0x8a2b, 0x9122, 0x8b4b, 0x8c8a, 0x8b49,
  0x8a2d, 0x9125, 0x8a2f, 0x8a2e, 0x8a31, 0x8a33,
]);

export function webglStrictParameter(parameter: number): boolean { return strictParameters.has(parameter); }

export function installBraveStrictWebGL(policy: WorldPrivacyPolicy): { coveredApis: string[]; failures: string[] } {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (policy.mode !== 'maximum') return { coveredApis, failures };
  const constructors = [
    typeof WebGLRenderingContext === 'undefined' ? undefined : WebGLRenderingContext,
    typeof WebGL2RenderingContext === 'undefined' ? undefined : WebGL2RenderingContext,
  ];
  for (const [version, constructor] of constructors.entries()) {
    if (!constructor) continue;
    const prototype = constructor.prototype;
    function patch(name: string, transform: (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      const original = (prototype as unknown as Record<string, unknown>)[name];
      if (typeof original !== 'function' || descriptor?.configurable === false) { failures.push(`WebGL${version + 1}.${name}: descriptor不可改写`); return; }
      Object.defineProperty(prototype, name, { configurable: true, writable: true, enumerable: descriptor?.enumerable ?? true, value: transform(original as (...args: unknown[]) => unknown) });
      coveredApis.push(`WebGL${version + 1}.${name}`);
    }
    for (const name of nullMethods) patch(name, original => function(this: unknown, ...args) { Reflect.apply(original, this, args); return null; });
    for (const name of emptyMethods) patch(name, original => function(this: unknown, ...args) { Reflect.apply(original, this, args); return ''; });
    patch('getAttribLocation', original => function(this: unknown, ...args) { Reflect.apply(original, this, args); return -1; });
    patch('getVertexAttribOffset', original => function(this: unknown, ...args) { Reflect.apply(original, this, args); return 0; });
    for (const name of ['getProgramParameter', 'getShaderParameter']) patch(name, original => function(this: WebGLRenderingContext, ...args) {
      const value = Reflect.apply(original, this, args);
      return this.isContextLost() && args[1] === 0x91b1 ? value : null;
    });
    patch('readPixels', () => function(this: WebGLRenderingContext) { this.isContextLost(); });
    patch('getShaderPrecisionFormat', original => function(this: unknown, ...args) {
      const value = Reflect.apply(original, this, args);
      if (!value || typeof value !== 'object') return value;
      return new Proxy(value, {
        get(target, property) { return ['rangeMin', 'rangeMax', 'precision'].includes(String(property)) ? 0 : Reflect.get(target, property, target); },
      });
    });
  }
  return { coveredApis, failures };
}
