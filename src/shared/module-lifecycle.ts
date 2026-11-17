import type { BrowserContext } from './contracts/browser-core';
import type { BrowserEvents, CommandName, CommandPayload, CommandResults, Dispose, EventName } from './contracts/envelope';
import type { BrowserCorePort, Migration, PageScriptPort, RequestHostPort, SecretStorePort, StorageHost } from './runtime-ports';

export type CommandContext = BrowserContext & { windowId: string; requestId: string };
export interface CommandRouter {
  handle<Name extends CommandName>(
    command: Name,
    handler: (payload: CommandPayload<Name>, context: CommandContext) => CommandResults[Name] | Promise<CommandResults[Name]>,
  ): Dispose;
}
export type EventAudience = { windowId: string } | { profileId: string; includePrivate?: boolean } | { contextId: string };
export interface FeatureRuntime {
  core: BrowserCorePort;
  storage: StorageHost;
  router: CommandRouter;
  pages: PageScriptPort;
  secrets: SecretStorePort;
  requests: RequestHostPort;
  publish<Name extends EventName>(event: Name, data: BrowserEvents[Name], audience: EventAudience): void;
}
export type FeatureRegistration = { id: string; dispose: () => void | Promise<void> };
export type FeatureDefinition = {
  id: string;
  migrations: readonly Migration[];
  register: (runtime: FeatureRuntime) => FeatureRegistration | Promise<FeatureRegistration>;
};
