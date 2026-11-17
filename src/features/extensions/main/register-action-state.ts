import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import type { ExtensionLibraryPort } from './library-port';
import { BrowserError } from '../../../shared/errors';
import { ExtensionRepository } from './extension-repository';

export function registerActionState(runtime: FeatureRuntime, adapter: (context: CommandContext) => Promise<ExtensionLibraryPort>) {
  return runtime.router.handle('extensions.actions', async (input, context) => {
    const tab = runtime.core.getTab(input.tabId);
    if (tab.windowId !== context.windowId || tab.contextId !== context.contextId || tab.profileId !== context.profileId) {
      throw new BrowserError('FORBIDDEN', '扩展action不能读取其他窗口标签');
    }
    if (context.isPrivate) return { tabId: tab.id, actions: [], revision: 0 };
    const library = await adapter(context);
    const loaded = new Set(new ExtensionRepository(runtime.storage.open(context.profileId)).list()
      .filter(extension => extension.enabled && extension.status === 'loaded').map(extension => extension.id));
    const state = library.actionState(tab.id);
    return { ...state, tabId: tab.id, actions: state.actions.filter(action => loaded.has(action.id)) };
  });
}
