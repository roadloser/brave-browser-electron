import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  commandSchemas, IPC_COMMAND_CHANNEL, WIRE_VERSION,
  type CommandName, type CommandPayload, type CommandResults, type Dispose,
} from '../../shared/contracts/envelope';
import type { CommandContext, CommandRouter } from '../../shared/module-lifecycle';
import type { BrowserCorePort } from '../../shared/runtime-ports';
import { BrowserError } from '../../shared/errors';
import { authorizeSender, authorizeTabTargets } from './sender-policy';
import { mapError } from './error-mapper';

const envelopeSchema = z.object({
  version: z.literal(WIRE_VERSION), requestId: z.string().min(1).max(128),
  command: z.string().min(1).max(128), payload: z.unknown(),
}).strict();
type RegisteredHandler = (payload: unknown, context: CommandContext) => unknown;

export class IpcRouter implements CommandRouter {
  private handlers = new Map<string, RegisteredHandler>();

  constructor(core: BrowserCorePort, uiUrl: string) {
    ipcMain.handle(IPC_COMMAND_CHANNEL, async (event, input: unknown) => {
      try {
        const envelope = envelopeSchema.parse(input);
        const context = authorizeSender(event, core, uiUrl, envelope.requestId);
        const handler = this.handlers.get(envelope.command);
        if (!handler) throw new BrowserError('NOT_FOUND', '浏览器功能尚未接入');
        authorizeTabTargets(envelope.payload, context, core);
        return { ok: true, value: await handler(envelope.payload, context) };
      } catch (error) {
        return { ok: false, error: mapError(error) };
      }
    });
  }

  handle<Name extends CommandName>(
    command: Name,
    handler: (payload: CommandPayload<Name>, context: CommandContext) => CommandResults[Name] | Promise<CommandResults[Name]>,
  ): Dispose {
    if (this.handlers.has(command)) throw new BrowserError('CONFLICT', `命令重复注册：${command}`, false);
    const registered: RegisteredHandler = (payload, context) =>
      handler(commandSchemas[command].parse(payload) as CommandPayload<Name>, context);
    this.handlers.set(command, registered);
    return () => { if (this.handlers.get(command) === registered) this.handlers.delete(command); };
  }

  dispose(): void {
    this.handlers.clear();
    ipcMain.removeHandler(IPC_COMMAND_CHANNEL);
  }
}
