import { BraveFarblingAlgorithms } from './algorithms/brave-algorithms';
import { RANDEN_REVISION } from './algorithms/randen-tables';
import { installBraveAudioPolicy } from './brave-audio-adapter';
import { installBraveCanvasPolicy } from './brave-canvas-adapter';
import { installBraveNavigator } from './brave-navigator-adapter';
import { installBraveWebGL } from './brave-webgl-adapter';
import { installBraveScreen } from './brave-screen-adapter';
import { installBraveAnalyser } from './brave-analyser-adapter';
import { installBraveHitTests } from './brave-hit-test-adapter';
import { installBraveStrictWebGL } from './brave-webgl-strict-adapter';
import type { WorldInstallResult, WorldPrivacyPolicy } from './world-types';

export function install(policy: WorldPrivacyPolicy): WorldInstallResult {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (policy.mode === 'off' || !policy.token) return { installed: false, coveredApis, failures, algorithmRevision: RANDEN_REVISION };
  const algorithms = new BraveFarblingAlgorithms(policy.token);
  const audio = installBraveAudioPolicy(policy);
  coveredApis.push(...audio.coveredApis);
  const canvas = installBraveCanvasPolicy({ pixels: bytes => ({ active: true, bytes: algorithms.pixels(bytes) }) });
  coveredApis.push(...canvas.coveredApis.map(name => `Canvas.${name}`));
  const navigator = installBraveNavigator(policy, algorithms);
  const webgl = installBraveWebGL(policy, algorithms);
  const screen = policy.screenFingerprinting ? installBraveScreen(algorithms) : { coveredApis: [], failures: [] };
  const analyser = installBraveAnalyser(policy);
  const hitTests = installBraveHitTests(policy);
  const strictWebgl = installBraveStrictWebGL(policy);
  coveredApis.push(...navigator.coveredApis, ...webgl.coveredApis, ...screen.coveredApis, ...analyser.coveredApis, ...hitTests.coveredApis, ...strictWebgl.coveredApis);
  failures.push(...navigator.failures, ...webgl.failures, ...screen.failures, ...analyser.failures, ...hitTests.failures, ...strictWebgl.failures);
  return { installed: coveredApis.length > 0, coveredApis, failures, algorithmRevision: RANDEN_REVISION };
}
