import { ipcRenderer, webFrame } from 'electron';
import { GhosteryContentAdapter } from './ghostery-content-adapter';
import { SHIELDS_COSMETIC_CHANNEL, SHIELDS_INVALIDATE_CHANNEL, type CosmeticFeatures, type CosmeticPagePlan, type CosmeticRuntimePort } from './protocol';

if (location.protocol === 'http:' || location.protocol === 'https:') {
  const runtime: CosmeticRuntimePort = new GhosteryContentAdapter();
  let disposed = false;
  let queue = Promise.resolve();
  let generation = 0;
  const scripts = new Set<string>();
  const request = (features: CosmeticFeatures) => {
    const url = location.href;
    const requestGeneration = generation;
    queue = queue.then(async () => {
      if (disposed || requestGeneration !== generation || location.href !== url) return;
      const plan = await ipcRenderer.invoke(SHIELDS_COSMETIC_CHANNEL, { ...features, url }) as CosmeticPagePlan;
      if (disposed || requestGeneration !== generation || location.href !== url) return;
      runtime.apply(plan);
      if (!plan.active) return;
      for (const script of plan.scripts) {
        if (disposed || requestGeneration !== generation || location.href !== url) return;
        if (scripts.has(script)) continue;
        scripts.add(script);
        await webFrame.executeJavaScript(script, false).catch(() => undefined);
      }
    }).catch(() => undefined);
  };
  const invalidate = () => {
    generation++; disposed = true;
    runtime.dispose(); scripts.clear();
  };
  ipcRenderer.on(SHIELDS_INVALIDATE_CHANNEL, invalidate);
  runtime.start(request);
  window.addEventListener('pagehide', () => {
    invalidate(); ipcRenderer.removeListener(SHIELDS_INVALIDATE_CHANNEL, invalidate);
  }, { once: true });
}
