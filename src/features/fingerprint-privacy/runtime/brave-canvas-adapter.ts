import type { CanvasFarblingBridge } from './canvas-protocol';

export function installBraveCanvasPolicy(bridgeName: string): { installed: boolean; coveredApis: string[] } {
  const bridge = (globalThis as unknown as Record<string, CanvasFarblingBridge>)[bridgeName];
  if (!bridge || typeof bridge.pixels !== 'function') return { installed: false, coveredApis: [] };
  const release: (() => void)[] = [];
  const coveredApis: string[] = [];
  const htmlPrototype = typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement.prototype;
  const offscreenPrototype = typeof OffscreenCanvas === 'undefined' ? null : OffscreenCanvas.prototype;
  const contextPrototype = typeof CanvasRenderingContext2D === 'undefined' ? null : CanvasRenderingContext2D.prototype;
  const offscreenContextPrototype = typeof OffscreenCanvasRenderingContext2D === 'undefined' ? null : OffscreenCanvasRenderingContext2D.prototype;
  const originalImageData = contextPrototype?.getImageData;
  const originalOffscreenImageData = offscreenContextPrototype?.getImageData;

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
    if (!descriptor?.configurable || typeof descriptor.value !== 'function') return;
    const value = replacement(descriptor.value as (...args: unknown[]) => unknown);
    Object.defineProperty(prototype, name, { ...descriptor, value });
    release.push(() => Object.defineProperty(prototype, name, descriptor));
    coveredApis.push(name);
  }

  function cloneHtml(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const clone = canvas.ownerDocument.createElement('canvas');
    clone.width = canvas.width; clone.height = canvas.height;
    const context = clone.getContext('2d');
    if (!context || !originalImageData) throw new DOMException('无法读取画布像素', 'NotSupportedError');
    context.drawImage(canvas, 0, 0);
    const image = originalImageData.call(context, 0, 0, clone.width, clone.height);
    context.putImageData(farble(image), 0, 0);
    return clone;
  }

  function cloneOffscreen(canvas: OffscreenCanvas): OffscreenCanvas {
    const clone = new OffscreenCanvas(canvas.width, canvas.height);
    const context = clone.getContext('2d');
    if (!context || !originalOffscreenImageData) throw new DOMException('无法读取离屏画布像素', 'NotSupportedError');
    context.drawImage(canvas, 0, 0);
    const image = originalOffscreenImageData.call(context, 0, 0, clone.width, clone.height);
    context.putImageData(farble(image), 0, 0);
    return clone;
  }

  try {
    for (const prototype of [contextPrototype, offscreenContextPrototype]) patch(prototype, 'getImageData', original => function(this: unknown, ...args) {
      return farble(Reflect.apply(original, this, args) as ImageData);
    });
    patch(htmlPrototype, 'toDataURL', original => function(this: HTMLCanvasElement, ...args) {
      if (!this.width || !this.height) return Reflect.apply(original, this, args);
      return Reflect.apply(original, cloneHtml(this), args);
    });
    patch(htmlPrototype, 'toBlob', original => function(this: HTMLCanvasElement, ...args) {
      if (!this.width || !this.height) return Reflect.apply(original, this, args);
      return Reflect.apply(original, cloneHtml(this), args);
    });
    patch(offscreenPrototype, 'convertToBlob', original => function(this: OffscreenCanvas, ...args) {
      if (!this.width || !this.height) return Reflect.apply(original, this, args);
      try { return Reflect.apply(original, cloneOffscreen(this), args); }
      catch (error) { return Promise.reject(error); }
    });
    return { installed: coveredApis.length > 0, coveredApis };
  } catch {
    release.reverse().forEach(restore => restore());
    return { installed: false, coveredApis: [] };
  }
}
