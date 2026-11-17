import type { WorldPrivacyPolicy } from './world-types';

export function installBraveGeometry(policy: WorldPrivacyPolicy): { coveredApis: string[]; failures: string[] } {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (typeof window === 'undefined' || !policy.screenFingerprinting) return { coveredApis, failures };
  function descriptor(target: object, name: string): { owner: object; descriptor: PropertyDescriptor } | null {
    let owner: object | null = target;
    while (owner) {
      const value = Object.getOwnPropertyDescriptor(owner, name);
      if (value) return { owner, descriptor: value };
      owner = Object.getPrototypeOf(owner) as object | null;
    }
    return null;
  }
  const outerWidth = descriptor(window, 'outerWidth');
  const outerHeight = descriptor(window, 'outerHeight');
  const screenX = descriptor(window, 'screenX');
  const screenY = descriptor(window, 'screenY');
  const nativeOuterWidth = outerWidth?.descriptor.get;
  const nativeOuterHeight = outerHeight?.descriptor.get;
  const nativeScreenX = screenX?.descriptor.get;
  const nativeScreenY = screenY?.descriptor.get;
  function patchMethod(name: 'resizeTo' | 'moveTo', original: (...args: unknown[]) => unknown, transform: (args: unknown[]) => unknown[]): void {
    const item = descriptor(window, name);
    if (!item || typeof item.descriptor.value !== 'function' || item.descriptor.configurable === false) {
      failures.push(`window.${name}: descriptor不可改写`);
      return;
    }
    Object.defineProperty(item.owner, name, {
      ...item.descriptor,
      value: function(this: unknown, ...args: unknown[]) {
        if (this !== window || args.length < 2) return Reflect.apply(original, this, args);
        return Reflect.apply(original, this, transform(args));
      },
    });
    coveredApis.push(`Window.${name}`);
  }
  const resize = descriptor(window, 'resizeTo')?.descriptor.value;
  if (typeof resize === 'function' && nativeOuterWidth && nativeOuterHeight) {
    patchMethod('resizeTo', resize as (...args: unknown[]) => unknown, args => {
      const width = Number(args[0]) >> 0; const height = Number(args[1]) >> 0;
      const realWidth = Number(Reflect.apply(nativeOuterWidth, window, []));
      const realHeight = Number(Reflect.apply(nativeOuterHeight, window, []));
      return [width + realWidth - window.outerWidth, height + realHeight - window.outerHeight];
    });
  }
  const move = descriptor(window, 'moveTo')?.descriptor.value;
  if (typeof move === 'function' && nativeScreenX && nativeScreenY) {
    patchMethod('moveTo', move as (...args: unknown[]) => unknown, args => {
      const coordinateX = Number(args[0]) >> 0; const coordinateY = Number(args[1]) >> 0;
      const realX = Number(Reflect.apply(nativeScreenX, window, []));
      const realY = Number(Reflect.apply(nativeScreenY, window, []));
      return [coordinateX + realX - window.screenX, coordinateY + realY - window.screenY];
    });
  }
  return { coveredApis, failures };
}
