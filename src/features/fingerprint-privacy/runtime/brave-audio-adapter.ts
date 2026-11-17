import type { WorldPrivacyPolicy } from './world-types';

export function installBraveAudioPolicy(policy: WorldPrivacyPolicy): { installed: boolean; coveredApis: string[] } {
  if (policy.mode === 'off' || !policy.token || typeof AudioBuffer === 'undefined') return { installed: false, coveredApis: [] };
  const prototype = AudioBuffer.prototype;
  const channelDescriptor = Object.getOwnPropertyDescriptor(prototype, 'getChannelData');
  const copyDescriptor = Object.getOwnPropertyDescriptor(prototype, 'copyFromChannel');
  if (!channelDescriptor?.configurable || !copyDescriptor?.configurable
    || typeof channelDescriptor.value !== 'function' || typeof copyDescriptor.value !== 'function') return { installed: false, coveredApis: [] };
  const originalChannel = channelDescriptor.value as AudioBuffer['getChannelData'];
  const originalCopy = copyDescriptor.value as AudioBuffer['copyFromChannel'];
  const high = BigInt(policy.token.high);
  const seed = BigInt(policy.token.low);
  const maximum = policy.mode === 'maximum';
  const limit = (1n << 64n) - 1n;
  const feedbackMask = 3n << 62n;
  const multiplier = 0.999 + (Number(high) / Number(limit)) / 1000;
  function farble(samples: Float32Array, count: number): void {
    let state = seed;
    for (let index = 0; index < count; index++) {
      if (maximum) {
        state = ((state >> 1n) | (((state << 62n) ^ (state << 61n)) & feedbackMask)) & limit;
        samples[index] = (Number(state) / Number(limit)) / 10;
      } else samples[index] = samples[index] * multiplier;
    }
  }
  try {
    Object.defineProperty(prototype, 'getChannelData', {
      ...channelDescriptor,
      value: function getChannelData(this: AudioBuffer, channel: number) {
        const samples = originalChannel.call(this, channel);
        farble(samples, samples.length);
        return samples;
      },
    });
    Object.defineProperty(prototype, 'copyFromChannel', {
      ...copyDescriptor,
      value: function copyFromChannel(this: AudioBuffer, destination: Float32Array, channel: number, start = 0) {
        originalCopy.call(this, destination, channel, start);
        const offset = Number(start) >>> 0;
        farble(destination, Math.max(0, Math.min(destination.length, this.length - offset)));
      },
    });
    return { installed: true, coveredApis: ['AudioBuffer.getChannelData', 'AudioBuffer.copyFromChannel'] };
  } catch {
    Object.defineProperty(prototype, 'getChannelData', channelDescriptor);
    Object.defineProperty(prototype, 'copyFromChannel', copyDescriptor);
    return { installed: false, coveredApis: [] };
  }
}
