import { ipcRenderer } from 'electron';
import {
  commandSchemas, IPC_COMMAND_CHANNEL, IPC_EVENT_CHANNEL, WIRE_VERSION,
  type BrowserBridge, type BrowserEvents, type CommandInput, type CommandName,
  type CommandResult, type CommandResults, type EventEnvelope, type EventName,
} from '../shared/contracts/envelope';

export function createBrowserBridge(): BrowserBridge {
  return Object.freeze({
    async command<Name extends CommandName>(name: Name, payload: CommandInput<Name>): Promise<CommandResult<CommandResults[Name]>> {
      if (!Object.hasOwn(commandSchemas, name)) {
        return { ok: false, error: { code: 'NOT_FOUND', message: '未知浏览器命令', recoverable: false } };
      }
      const parsed = commandSchemas[name].safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '请求参数无效', recoverable: true } };
      }
      return ipcRenderer.invoke(IPC_COMMAND_CHANNEL, {
        version: WIRE_VERSION, requestId: globalThis.crypto.randomUUID(), command: name, payload: parsed.data,
      });
    },
    subscribe<Name extends EventName>(name: Name, listener: (data: BrowserEvents[Name]) => void) {
      const handler = (_event: Electron.IpcRendererEvent, envelope: EventEnvelope<Name>) => {
        if (envelope?.version === WIRE_VERSION && envelope.event === name) listener(envelope.data);
      };
      ipcRenderer.on(IPC_EVENT_CHANNEL, handler);
      return () => ipcRenderer.removeListener(IPC_EVENT_CHANNEL, handler);
    },
  });
}
