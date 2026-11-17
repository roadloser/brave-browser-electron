import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SiteOriginRepository } from './site-origin-repository';

export function httpOrigin(value: string): string | undefined {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.origin : undefined; } catch { return undefined; }
}
export function recordSiteOrigins(runtime: FeatureRuntime, repository: SiteOriginRepository, changed: (contextId: string) => void): () => void {
  const stopEvents = runtime.core.onEvent(event => {
    if (event.type === 'contextDisposed') { repository.release(event.context.contextId); return; }
    if (event.type !== 'frameOriginObserved') return;
    try { repository.observe(event.context, event.origin, event.timestamp); changed(event.context.contextId); }
    catch { runtime.publish('app.error', { code: 'STORAGE_FAILED', message: '站点列表更新失败，浏览数据仍由当前会话保存', recoverable: true }, { windowId: event.windowId }); }
  });
  return () => { stopEvents(); repository.dispose(); };
}
