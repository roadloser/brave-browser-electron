import type { CanvasContextPort, CanvasFormat } from './canvas-context-port';

type ImageContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type GetImageData = (this: ImageContext, x: number, y: number, width: number, height: number, options?: Record<string, string>) => ImageData;

export function createCanvasExportAdapter(contexts: CanvasContextPort, farble: (image: ImageData) => ImageData,
  htmlGetImageData?: GetImageData, offscreenGetImageData?: GetImageData) {
  const settings = (format: CanvasFormat) => ({ colorSpace: format.colorSpace, colorType: format.colorType, alpha: true, willReadFrequently: true });
  const imageSettings = (format: CanvasFormat) => ({
    colorSpace: format.colorSpace,
    pixelFormat: format.colorType === 'unorm8' ? 'rgba-unorm8' : format.colorType === 'float16' ? 'rgba-float16' : 'rgba-float32',
  });

  function ensureFormat(context: ImageContext, expected: CanvasFormat): void {
    const actual = context.getContextAttributes() as { colorSpace?: string; colorType?: string };
    if (actual.colorSpace !== expected.colorSpace || (actual.colorType ?? 'unorm8') !== expected.colorType) {
      throw new DOMException('导出临时画布不支持原色域或像素格式，未静默转换为sRGB', 'NotSupportedError');
    }
  }

  function html(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const format = contexts.format(canvas);
    if (!format) throw new DOMException('无法确认该画布原context的色域与像素格式', 'NotSupportedError');
    const clone = canvas.ownerDocument.createElement('canvas');
    clone.width = canvas.width; clone.height = canvas.height;
    const context = clone.getContext('2d', settings(format) as CanvasRenderingContext2DSettings);
    if (!context || !htmlGetImageData) throw new DOMException('无法建立导出画布', 'NotSupportedError');
    ensureFormat(context, format);
    context.drawImage(canvas, 0, 0);
    const image = htmlGetImageData.call(context, 0, 0, clone.width, clone.height, imageSettings(format));
    context.putImageData(farble(image), 0, 0);
    return clone;
  }

  function offscreen(canvas: OffscreenCanvas): OffscreenCanvas {
    const format = contexts.format(canvas);
    if (!format) throw new DOMException('无法确认离屏画布原context的色域与像素格式', 'NotSupportedError');
    const clone = new OffscreenCanvas(canvas.width, canvas.height);
    const context = clone.getContext('2d', settings(format));
    if (!context || !offscreenGetImageData) throw new DOMException('无法建立离屏导出画布', 'NotSupportedError');
    ensureFormat(context, format);
    context.drawImage(canvas, 0, 0);
    const image = offscreenGetImageData.call(context, 0, 0, clone.width, clone.height, imageSettings(format));
    context.putImageData(farble(image), 0, 0);
    return clone;
  }

  return { html, offscreen };
}
