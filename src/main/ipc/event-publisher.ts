import { BrowserWindow } from 'electron';
import { IPC_EVENT_CHANNEL, WIRE_VERSION, type BrowserEvents, type EventName } from '../../shared/contracts/envelope';
import type { EventAudience } from '../../shared/module-lifecycle';
import type { BrowserCorePort } from '../../shared/runtime-ports';

export function createEventPublisher(core: BrowserCorePort) {
  return <Name extends EventName>(event: Name, data: BrowserEvents[Name], audience: EventAudience): void => {
    for (const nativeWindow of BrowserWindow.getAllWindows()) {
      if (nativeWindow.isDestroyed() || nativeWindow.webContents.isDestroyed()) continue;
      const window = core.getWindowForSender(nativeWindow.webContents.id);
      if (!window) continue;
      const matches = 'windowId' in audience ? window.id === audience.windowId
        : 'contextId' in audience ? window.contextId === audience.contextId
        : window.profileId === audience.profileId && (!window.isPrivate || audience.includePrivate === true);
      if (matches) nativeWindow.webContents.send(IPC_EVENT_CHANNEL, { version: WIRE_VERSION, event, data });
    }
  };
}
