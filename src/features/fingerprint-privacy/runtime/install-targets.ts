import { globalPrototype, type InstallationTarget } from './installation-guard';

const targets = (names: string[], properties: string[], inherited = false): InstallationTarget[] =>
  names.map(name => ({ object: globalPrototype(name), properties, inherited }));

export const audioTargets = () => targets(['AudioBuffer'], ['getChannelData', 'copyFromChannel']);
export const analyserTargets = () => targets(['AnalyserNode'], ['getFloatTimeDomainData', 'getByteTimeDomainData', 'getFloatFrequencyData', 'getByteFrequencyData']);
export const canvasTargets = () => [
  ...targets(['HTMLCanvasElement', 'OffscreenCanvas'], ['getContext', 'toDataURL', 'toBlob', 'convertToBlob']),
  ...targets(['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D'], ['getImageData']),
];
export const navigatorTargets = (): InstallationTarget[] => [{
  object: typeof navigator === 'undefined' ? null : Object.getPrototypeOf(navigator),
  properties: ['hardwareConcurrency', 'deviceMemory', 'languages', 'language', 'userAgent'], inherited: true,
}];
export const webglTargets = () => targets(['WebGLRenderingContext', 'WebGL2RenderingContext'], [
  'getSupportedExtensions', 'getExtension', 'getParameter', 'getActiveAttrib', 'getActiveUniform',
  'getAttachedShaders', 'getBufferParameter', 'getFramebufferAttachmentParameter', 'getRenderbufferParameter',
  'getTexParameter', 'getUniform', 'getUniformLocation', 'getVertexAttrib', 'getProgramInfoLog', 'getShaderInfoLog',
  'getShaderSource', 'getAttribLocation', 'getVertexAttribOffset', 'getProgramParameter', 'getShaderParameter',
  'readPixels', 'getShaderPrecisionFormat',
]);
export const geometryTargets = (): InstallationTarget[] => [{ object: typeof window === 'undefined' ? null : window, properties: ['resizeTo', 'moveTo'], inherited: true }];
export const screenTargets = (): InstallationTarget[] => [
  { object: typeof window === 'undefined' ? null : window, properties: ['outerWidth', 'outerHeight', 'screenX', 'screenY', 'screenLeft', 'screenTop'], inherited: true },
  { object: typeof screen === 'undefined' ? null : screen, properties: ['width', 'height', 'availWidth', 'availHeight', 'availLeft', 'availTop', 'isExtended'], inherited: true },
];
export const pointerTargets = () => targets(['MouseEvent', 'PointerEvent'], ['screenX', 'screenY']);
export const hitTestTargets = () => targets(['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D'], ['isPointInPath', 'isPointInStroke'], true);
export const textTargets = () => targets(['CanvasRenderingContext2D'], ['measureText']);
