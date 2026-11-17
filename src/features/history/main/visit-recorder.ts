import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { HistoryService } from './service';

export function registerVisitRecorder(runtime: FeatureRuntime, service: HistoryService) {
  const seenTitles = new Map<string, string>();
  return runtime.core.onEvent(event => {
    try {
      if (event.type === 'navigationCommitted') service.record(event.visit);
      if (event.type === 'tabClosed') seenTitles.delete(event.tabId);
      if (event.type === 'contextDisposed') seenTitles.clear();
      if (event.type === 'stateChanged') {
        for (const window of event.state.windows) {
          if (window.isPrivate) continue;
          for (const tab of window.tabs) {
            const key = `${tab.navigationId}:${tab.title}`;
            if (seenTitles.get(tab.id) === key) continue;
            service.updateTitle(tab);
            seenTitles.set(tab.id, key);
          }
        }
      }
    } catch {
      const windowId = event.type === 'navigationCommitted' ? event.visit.windowId
        : event.type === 'stateChanged' ? event.windowId : undefined;
      if (windowId) runtime.publish('app.error', {
        code: 'STORAGE_FAILED', message: '浏览历史未能保存，请检查资料存储后重试', recoverable: true,
      }, { windowId });
    }
  });
}
