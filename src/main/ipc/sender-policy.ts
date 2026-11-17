import type { IpcMainInvokeEvent } from 'electron';
import type { BrowserCorePort } from '../../shared/runtime-ports';
import { BrowserError } from '../../shared/errors';
import type { CommandContext } from '../../shared/module-lifecycle';

function documentUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  return url.href;
}

export function authorizeSender(
  event: IpcMainInvokeEvent, core: BrowserCorePort, uiUrl: string, requestId: string,
): CommandContext {
  const frame = event.senderFrame;
  const window = core.getWindowForSender(event.sender.id);
  if (!frame || frame !== event.sender.mainFrame || !window || documentUrl(frame.url) !== documentUrl(uiUrl)) {
    throw new BrowserError('FORBIDDEN', '此页面无权使用浏览器管理接口', false);
  }
  return {
    requestId, windowId: window.id, profileId: window.profileId,
    contextId: window.contextId, isPrivate: window.isPrivate,
  };
}

export function authorizeTabTargets(payload: unknown, context: CommandContext, core: BrowserCorePort): void {
  if (!payload || typeof payload !== 'object') return;
  for (const [key, value] of Object.entries(payload)) {
    const targets = (key === 'tabId' || key === 'sidebarTabId') && typeof value === 'string'
      ? [value]
      : (key === 'tabIds' || key === 'splitTabIds') && Array.isArray(value) ? value : [];
    for (const tabId of targets) {
      if (typeof tabId !== 'string') throw new BrowserError('INVALID_ARGUMENT', '标签身份无效');
      const tab = core.getTab(tabId);
      if (tab.windowId !== context.windowId || tab.contextId !== context.contextId) {
        throw new BrowserError('FORBIDDEN', '不能操作其他窗口或资料的标签', false);
      }
    }
  }
}
