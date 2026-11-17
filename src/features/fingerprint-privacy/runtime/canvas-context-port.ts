export type CanvasFormat = { colorSpace: string; colorType: 'unorm8' | 'float16' | 'float32'; alpha: boolean };
export type CanvasSource = HTMLCanvasElement | OffscreenCanvas;
export interface CanvasContextPort {
  start(): { dispose: () => void; failures: string[] };
  format(canvas: CanvasSource): CanvasFormat | null;
  hasContext(canvas: CanvasSource): boolean;
}
