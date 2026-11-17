import { clipboard, Menu, type MenuItemConstructorOptions } from 'electron';
import type { FeatureRuntime } from '../../shared/module-lifecycle';

export function attachPageContextMenu(runtime: FeatureRuntime, tabId: string): () => void {
  const contents = runtime.core.getTabWebContents(tabId);
  const handler = (_event: Electron.Event, details: Electron.ContextMenuParams) => {
    const tab = runtime.core.getTab(tabId);
    const items: MenuItemConstructorOptions[] = [];
    if (details.linkURL && /^https?:/i.test(details.linkURL)) {
      items.push(
        { label: '在新标签页中打开链接', click: () => { void runtime.core.openTab({ windowId: tab.windowId, url: details.linkURL, active: false }); } },
        { label: '在新窗口中打开链接', click: () => {
          const opened = tab.kind === 'tor' ? runtime.core.openTorWindow(tab.profileId, async () => undefined) : runtime.core.openWindow({ profileId: tab.profileId, isPrivate: tab.isPrivate });
          void opened.then(window => runtime.core.navigate(window.activeTabId!, details.linkURL));
        } },
        { label: '复制链接地址', click: () => clipboard.writeText(details.linkURL) },
        { type: 'separator' },
      );
    }
    if (details.mediaType === 'image' && details.srcURL) {
      items.push({ label: '复制图片', click: () => contents.copyImageAt(details.x, details.y) });
      if (/^https?:/i.test(details.srcURL)) items.push(
        { label: '图片另存为…', click: () => contents.downloadURL(details.srcURL) },
        { label: '在新标签页中打开图片', click: () => { void runtime.core.openTab({ windowId: tab.windowId, url: details.srcURL }); } },
      );
      items.push({ type: 'separator' });
    }
    if (details.isEditable) items.push(
      { label: '撤销', role: 'undo', enabled: details.editFlags.canUndo },
      { label: '重做', role: 'redo', enabled: details.editFlags.canRedo },
      { type: 'separator' }, { label: '剪切', role: 'cut', enabled: details.editFlags.canCut },
      { label: '复制', role: 'copy', enabled: details.editFlags.canCopy },
      { label: '粘贴', role: 'paste', enabled: details.editFlags.canPaste },
      { label: '全选', role: 'selectAll', enabled: details.editFlags.canSelectAll },
    );
    else if (details.selectionText) items.push({ label: '复制', click: () => contents.copy() });
    if (details.selectionText) items.push({ label: '搜索所选文字', click: () => { void runtime.core.openTab({ windowId: tab.windowId, url: details.selectionText }); } });
    if (items.length) items.push({ type: 'separator' });
    items.push(
      { label: '后退', enabled: tab.canGoBack, click: () => runtime.core.goBack(tabId) },
      { label: '前进', enabled: tab.canGoForward, click: () => runtime.core.goForward(tabId) },
      { label: '重新加载', click: () => runtime.core.reload(tabId) },
      { label: '打印…', click: () => { void runtime.core.print(tabId).then(result => {
        if (!result.success && result.failureReason) runtime.publish('app.error', { code: 'CANCELLED', message: result.failureReason, recoverable: true }, { windowId: tab.windowId });
      }); } },
    );
    Menu.buildFromTemplate(items).popup({ window: runtime.core.getNativeWindow(tab.windowId) });
  };
  contents.on('context-menu', handler);
  return () => { if (!contents.isDestroyed()) contents.removeListener('context-menu', handler); };
}
