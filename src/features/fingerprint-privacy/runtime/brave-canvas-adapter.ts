import type { CanvasFarblingBridge } from './canvas-protocol';
import { CanvasContextRegistry } from './canvas-context-registry';
import { createCanvasExportAdapter } from './canvas-export-adapter';

export function installBraveCanvasPolicy(bridge: CanvasFarblingBridge): { installed: boolean; coveredApis: string[]; failures: string[] } {
  if (!bridge || typeof bridge.pixels !== 'function') return { installed: false, coveredApis: [], failures: ['像素算法映射不可用'] };
  const release: (() => void)[] = [];
  const coveredApis: string[] = [];
  const htmlPrototype = typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement.prototype;
  const offscreenPrototype = typeof OffscreenCanvas === 'undefined' ? null : OffscreenCanvas.prototype;
  const contextPrototype = typeof CanvasRenderingContext2D === 'undefined' ? null : CanvasRenderingContext2D.prototype;
  const offscreenContextPrototype = typeof OffscreenCanvasRenderingContext2D === 'undefined' ? null : OffscreenCanvasRenderingContext2D.prototype;
  const originalImageData = contextPrototype?.getImageData;
  const originalOffscreenImageData = offscreenContextPrototype?.getImageData;
  const contexts = new CanvasContextRegistry();
  const registered = contexts.start();
  release.push(registered.dispose);
  const failures = [...registered.failures];

  function farble(image: ImageData): ImageData {
    const bytes = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    const result = bridge.pixels(bytes);
    if (result.error) throw new DOMException(result.error, 'NotSupportedError');
    if (result.active) {
      if (!(result.bytes instanceof Uint8Array) || result.bytes.byteLength !== bytes.byteLength) throw new DOMException('指纹像素转换长度无效', 'NotSupportedError');
      bytes.set(result.bytes);
    }
    return image;
  }

  function patch(prototype: object | null, name: string, replacement: (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown): void {
    if (!prototype) return;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor?.configurable || typeof descriptor.value !== 'function') { failures.push(`Canvas.${name}: descriptor不可改写`); return; }
    const value = replacement(descriptor.value as (...args: unknown[]) => unknown);
    Object.defineProperty(prototype, name, { ...descriptor, value });
    release.push(() => Object.defineProperty(prototype, name, descriptor));
    coveredApis.push(name);
  }

  const exports = createCanvasExportAdapter(contexts, farble, originalImageData, originalOffscreenImageData);

  try {
    for (const prototype of [contextPrototype, offscreenContextPrototype]) patch(prototype, 'getImageData', original => function(this: unknown, ...args) {
      return farble(Reflect.apply(original, this, args) as ImageData);
    });
    patch(htmlPrototype, 'toDataURL', original => function(this: HTMLCanvasElement, ...args) {
      if (!this.width || !this.height || !contexts.hasContext(this)) return Reflect.apply(original, this, args);
      return Reflect.apply(original, exports.html(this), args);
    });
    patch(htmlPrototype, 'toBlob', original => function(this: HTMLCanvasElement, ...args) {
      if (typeof args[0] !== 'function' || !this.width || !this.height || !contexts.hasContext(this)) return Reflect.apply(original, this, args);
      return Reflect.apply(original, exports.html(this), args);
    });
    patch(offscreenPrototype, 'convertToBlob', original => function(this: OffscreenCanvas, ...args) {
      if (!this.width || !this.height || !contexts.hasContext(this)) return Reflect.apply(original, this, args);
      try { return Reflect.apply(original, exports.offscreen(this), args); }
      catch (error) { return Promise.reject(error); }
    });
    failures.push('Canvas导出采用同色域/格式clone；原生SkPixmap预乘alpha、native通道顺序与rowBytes未运行对照');
    failures.push('未登记context的画布导出保留原生行为；此分支未声明像素防护覆盖');
    return { installed: coveredApis.length > 0, coveredApis, failures };
  } catch {
    release.reverse().forEach(restore => restore());
    return { installed: false, coveredApis: [], failures: [...failures, 'Canvas安装失败，已恢复原API'] };
  }
}
