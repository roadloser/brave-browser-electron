import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { ReaderProvider } from './reader-provider';
import { CaptureService } from './capture-service';

export const pageToolsFeature: FeatureDefinition = {
  id: 'page-tools',
  migrations: [],
  register(runtime) {
    const reader = new ReaderProvider(runtime);
    const capture = new CaptureService(runtime);
    const assertTab = (tabId: string, windowId: string) => {
      if (runtime.core.getTab(tabId).windowId !== windowId) throw new BrowserError('FORBIDDEN', '不能操作其他窗口的网页');
    };
    const disposers = [
      runtime.router.handle('pageTools.read', (payload, context) => {
        assertTab(payload.tabId, context.windowId);
        return reader.read(payload.tabId);
      }),
      runtime.router.handle('pageTools.capture', (payload, context) => {
        assertTab(payload.tabId, context.windowId);
        return capture.capture(payload.tabId, payload.fullPage);
      }),
    ];
    return { id: 'page-tools', dispose() { disposers.forEach((dispose) => dispose()); reader.dispose(); } };
  },
};
