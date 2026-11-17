import type { BrowserContext } from './contracts/browser-core';
import type { BrowserEvents, CommandName, CommandPayload, CommandResults, Dispose, EventName } from './contracts/envelope';
import type { BrowserCorePort, DebuggerHostPort, Migration, PageScriptPort, RequestHostPort, SecretStorePort, StorageHost } from './runtime-ports';
import type { SyncDataPort, SyncTabsPort } from './sync-data-ports';
import type { ContextNetworkPort } from './network-ports';

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
  syncData: SyncDataPort;
  syncTabs: SyncTabsPort;
  pages: PageScriptPort;
  debugger: DebuggerHostPort;
  network: ContextNetworkPort;
  secrets: SecretStorePort;
  requests: RequestHostPort;
  assets: { credentialPreloadPath: string; translationPreloadPath: string; shieldsPreloadPath: string; privacyServiceWorkerPreloadPath: string; privacyPreloadPath: string; walletPreloadPath: string };
  publish<Name extends EventName>(event: Name, data: BrowserEvents[Name], audience: EventAudience): void;
}
export type FeatureRegistration = { id: string; dispose: () => void | Promise<void> };
export type FeatureDefinition = {
  id: string;
  migrations: readonly Migration[];
  register: (runtime: FeatureRuntime) => FeatureRegistration | Promise<FeatureRegistration>;
};
