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
import { installBraveGeometry } from './brave-geometry-adapter';
import { installBravePointer } from './brave-pointer-adapter';
import { installBraveTextMetrics } from './brave-text-metrics-adapter';
import type { WorldInstallResult, WorldPrivacyPolicy } from './world-types';
import { guardInstallation } from './installation-guard';
import { audioTargets, analyserTargets, canvasTargets, navigatorTargets, webglTargets, geometryTargets, screenTargets, pointerTargets, hitTestTargets, textTargets } from './install-targets';

export function install(policy: WorldPrivacyPolicy): WorldInstallResult {
  const coveredApis: string[] = [];
  const failures: string[] = [];
  if (policy.mode === 'off' || !policy.token) return { installed: false, coveredApis, failures, algorithmRevision: RANDEN_REVISION };
  const algorithms = new BraveFarblingAlgorithms(policy.token);
  const audio = guardInstallation('AudioBuffer', audioTargets(), () => ({ ...installBraveAudioPolicy(policy), failures: [] }));
  coveredApis.push(...audio.coveredApis);
  const canvas = guardInstallation('Canvas', canvasTargets(), () => installBraveCanvasPolicy({ pixels: bytes => ({ active: true, bytes: algorithms.pixels(bytes) }) }));
  coveredApis.push(...canvas.coveredApis.map(name => `Canvas.${name}`));
  failures.push(...audio.failures, ...canvas.failures);
  const navigator = guardInstallation('Navigator', navigatorTargets(), () => installBraveNavigator(policy, algorithms));
  const webgl = guardInstallation('WebGL', webglTargets(), () => installBraveWebGL(policy, algorithms));
  const geometry = guardInstallation('Window geometry', geometryTargets(), () => installBraveGeometry(policy));
  const screen = policy.screenFingerprinting ? guardInstallation('Screen', screenTargets(), () => installBraveScreen(algorithms)) : { coveredApis: [], failures: [] };
  const analyser = guardInstallation('Analyser', analyserTargets(), () => installBraveAnalyser(policy));
  const hitTests = guardInstallation('Canvas hit tests', hitTestTargets(), () => installBraveHitTests(policy));
  const strictWebgl = guardInstallation('Strict WebGL', webglTargets(), () => installBraveStrictWebGL(policy));
  const pointer = guardInstallation('Pointer', pointerTargets(), () => installBravePointer(policy, algorithms));
  const textMetrics = guardInstallation('TextMetrics', textTargets(), () => installBraveTextMetrics(policy));
  coveredApis.push(...navigator.coveredApis, ...webgl.coveredApis, ...screen.coveredApis, ...analyser.coveredApis, ...hitTests.coveredApis, ...strictWebgl.coveredApis, ...geometry.coveredApis, ...pointer.coveredApis, ...textMetrics.coveredApis);
  failures.push(...navigator.failures, ...webgl.failures, ...screen.failures, ...analyser.failures, ...hitTests.failures, ...strictWebgl.failures, ...geometry.failures, ...pointer.failures, ...textMetrics.failures);
  return { installed: coveredApis.length > 0, coveredApis, failures, algorithmRevision: RANDEN_REVISION };
}

export function installController(initialPolicy: WorldPrivacyPolicy) {
  const policy = { ...initialPolicy };
  const result = install(policy);
  return {
    report() { return result; },
    updateZoom(factor: number) {
      if (!Number.isFinite(factor) || factor <= 0 || factor > 10) throw new Error('缩放因子无效');
      policy.pageZoom = factor;
    },
  };
}
