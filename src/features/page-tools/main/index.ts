import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { ReaderProvider } from './reader-provider';
import { CaptureService } from './capture-service';
import { TranslationProvider } from './translation-provider';

export const pageToolsFeature: FeatureDefinition = {
  id: 'page-tools',
  migrations: [],
  register(runtime) {
    const reader = new ReaderProvider(runtime);
    const capture = new CaptureService(runtime);
    const translation = new TranslationProvider(runtime);
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
      runtime.router.handle('pageTools.translationState', (payload, context) => {
        assertTab(payload.tabId, context.windowId);
        return translation.state(payload.tabId);
      }),
      runtime.router.handle('pageTools.translate', (payload, context) => {
        assertTab(payload.tabId, context.windowId);
        return translation.translate(payload.tabId, payload.targetLanguage);
      }),
      runtime.router.handle('pageTools.cancelTranslation', (payload, context) => {
        assertTab(payload.tabId, context.windowId);
        return translation.cancel(payload.tabId, false);
      }),
      runtime.router.handle('pageTools.undoTranslation', (payload, context) => {
        assertTab(payload.tabId, context.windowId);
        return translation.cancel(payload.tabId, true);
      }),
    ];
    return { id: 'page-tools', async dispose() { disposers.forEach((dispose) => dispose()); await translation.dispose(); reader.dispose(); } };
  },
};
