import type { WorldPrivacyPolicy } from './world-types';
import { nextLfsr } from './algorithms/brave-algorithms';

export function installBraveAnalyser(policy: WorldPrivacyPolicy): { coveredApis: string[]; failures: string[] } {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (!policy.token || typeof AnalyserNode === 'undefined') return { coveredApis, failures };
  const prototype = AnalyserNode.prototype;
  const floatTime = prototype.getFloatTimeDomainData;
  const floatFrequency = prototype.getFloatFrequencyData;
  const limit = Number((1n << 64n) - 1n);
  const seed = BigInt(policy.token.low);
  const multiplier = 0.999 + (Number(BigInt(policy.token.high)) / limit) / 1000;
  const maximum = policy.mode === 'maximum';
  function patch(name: string, operation: (node: AnalyserNode, destination: Float32Array | Uint8Array) => void) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor?.configurable) { failures.push(`AnalyserNode.${name}: descriptor不可改写`); return; }
    Object.defineProperty(prototype, name, { ...descriptor, value: function(this: AnalyserNode, destination: Float32Array | Uint8Array) { operation(this, destination); } });
    coveredApis.push(`AnalyserNode.${name}`);
  }
  patch('getFloatTimeDomainData', (node, destination) => {
    if (!(destination instanceof Float32Array)) return Reflect.apply(floatTime, node, [destination]);
    floatTime.call(node, destination);
    let state = seed;
    for (let index = 0; index < Math.min(destination.length, node.fftSize); index++) {
      if (maximum) { state = nextLfsr(state); destination[index] = Number(state) / limit / 10; }
      else destination[index] = destination[index] * multiplier;
    }
  });
  patch('getByteTimeDomainData', (node, destination) => {
    if (!(destination instanceof Uint8Array)) throw new TypeError('destination must be Uint8Array');
    const source = new Float32Array(Math.min(destination.length, node.fftSize));
    floatTime.call(node, source);
    let state = seed;
    for (let index = 0; index < source.length; index++) {
      if (maximum) state = nextLfsr(state);
      const linear = maximum ? Math.fround(Number(state) / limit / 10) : Math.fround(source[index] * multiplier);
      destination[index] = Math.min(255, Math.max(0, 128 * (linear + 1)));
    }
  });
  patch('getFloatFrequencyData', (node, destination) => {
    if (!(destination instanceof Float32Array)) return Reflect.apply(floatFrequency, node, [destination]);
    floatFrequency.call(node, destination);
    let state = seed;
    for (let index = 0; index < Math.min(destination.length, node.frequencyBinCount); index++) {
      if (maximum) { state = nextLfsr(state); destination[index] = 20 * Math.log10(Math.fround(Number(state) / limit / 10)); }
      else destination[index] = 20 * Math.log10(Math.fround(Math.pow(10, destination[index] / 20) * multiplier));
    }
  });
  patch('getByteFrequencyData', (node, destination) => {
    if (!(destination instanceof Uint8Array)) throw new TypeError('destination must be Uint8Array');
    const source = new Float32Array(Math.min(destination.length, node.frequencyBinCount));
    floatFrequency.call(node, source);
    let state = seed;
    for (let index = 0; index < source.length; index++) {
      if (maximum) state = nextLfsr(state);
      const linear = maximum ? Math.fround(Number(state) / limit / 10) : Math.fround(Math.pow(10, source[index] / 20) * multiplier);
      const decibels = 20 * Math.log10(linear);
      destination[index] = Math.min(255, Math.max(0, 255 * (decibels - node.minDecibels) / (node.maxDecibels - node.minDecibels)));
    }
  });
  return { coveredApis, failures };
}
