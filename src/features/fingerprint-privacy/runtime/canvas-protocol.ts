export const PRIVACY_CANVAS_CHANNEL = 'brave:privacy:canvas-pixels';
export const PRIVACY_CANVAS_BRIDGE = '__braveElectronCanvasPrivacyV1';
export type CanvasPixelResult = { active: boolean; bytes: Uint8Array; error?: string };
export type CanvasFarblingBridge = { pixels(bytes: Uint8Array): CanvasPixelResult };
