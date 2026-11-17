import { ipcRenderer, webFrame } from 'electron';
import { GhosteryContentAdapter } from './ghostery-content-adapter';
import { SHIELDS_COSMETIC_CHANNEL, type CosmeticFeatures, type CosmeticPagePlan, type CosmeticRuntimePort } from './protocol';

if (location.protocol === 'http:' || location.protocol === 'https:') {
  const runtime: CosmeticRuntimePort = new GhosteryContentAdapter();
  let disposed = false;
  let queue = Promise.resolve();
  const scripts = new Set<string>();
  const request = (features: CosmeticFeatures) => {
    const url = location.href;
    queue = queue.then(async () => {
      if (disposed || location.href !== url) return;
      const plan = await ipcRenderer.invoke(SHIELDS_COSMETIC_CHANNEL, { ...features, url }) as CosmeticPagePlan;
      if (disposed || location.href !== url) return;
      runtime.apply(plan);
      if (!plan.active) return;
      for (const script of plan.scripts) {
        if (scripts.has(script)) continue;
        scripts.add(script);
        await webFrame.executeJavaScript(script, false).catch(() => undefined);
      }
    }).catch(() => undefined);
  };
  runtime.start(request);
  window.addEventListener('pagehide', () => { disposed = true; runtime.dispose(); }, { once: true });
}
