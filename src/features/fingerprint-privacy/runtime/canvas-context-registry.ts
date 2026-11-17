import type { CanvasContextPort, CanvasFormat, CanvasSource } from './canvas-context-port';

type CanvasContext = { getContextAttributes?: () => { colorSpace?: string; colorType?: string }; drawingBufferColorSpace?: string };

export class CanvasContextRegistry implements CanvasContextPort {
  private readonly formats = new WeakMap<CanvasSource, CanvasFormat>();

  start() {
    const releases: (() => void)[] = [];
    const failures: string[] = [];
    const prototypes = [
      typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement.prototype,
      typeof OffscreenCanvas === 'undefined' ? null : OffscreenCanvas.prototype,
    ];
    for (const prototype of prototypes) {
      if (!prototype) continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'getContext');
      if (!descriptor?.configurable || typeof descriptor.value !== 'function') { failures.push('Canvas.getContext格式登记入口不可改写'); continue; }
      const original = descriptor.value as (...args: unknown[]) => CanvasContext | null;
      const registry = this;
      Object.defineProperty(prototype, 'getContext', {
        ...descriptor,
        value: function(this: CanvasSource, ...args: unknown[]) {
          const context = Reflect.apply(original, this, args) as CanvasContext | null;
          if (context) registry.record(this, context);
          return context;
        },
      });
      releases.push(() => Object.defineProperty(prototype, 'getContext', descriptor));
    }
    return { dispose: () => releases.reverse().forEach(release => release()), failures };
  }

  format(canvas: CanvasSource): CanvasFormat | null { return this.formats.get(canvas) ?? null; }

  private record(canvas: CanvasSource, context: CanvasContext): void {
    const attributes = context.getContextAttributes?.();
    const colorType = attributes?.colorType ?? 'unorm8';
    if (!['unorm8', 'float16', 'float32'].includes(colorType)) return;
    this.formats.set(canvas, {
      colorSpace: attributes?.colorSpace ?? context.drawingBufferColorSpace ?? 'srgb',
      colorType: colorType as CanvasFormat['colorType'],
    });
  }
}
