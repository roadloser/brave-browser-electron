export type CanvasPixelResult = { active: boolean; bytes: Uint8Array; error?: string };
export type CanvasFarblingBridge = { pixels(bytes: Uint8Array): CanvasPixelResult };
