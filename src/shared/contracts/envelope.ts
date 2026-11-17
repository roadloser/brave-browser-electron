import { z } from 'zod';
import { browserCommandSchemas, type BrowserCommandResults, type BrowserSnapshot } from './browser-core';
import { tabGroupCommandSchemas, type TabGroupCommandResults, type TabGroupsState } from './tab-groups';
import { bookmarkCommandSchemas, type BookmarkCommandResults, type BookmarksState } from './bookmarks';
import { historyCommandSchemas, type HistoryCommandResults } from './history';
import { settingsCommandSchemas, type SettingsCommandResults, type SettingsState } from './settings';
import { downloadsCommandSchemas, type DownloadsCommandResults, type DownloadsState } from './downloads';
import { siteSettingsCommandSchemas, type SiteSettingsCommandResults, type SiteSettingsState } from './site-settings';
import { credentialsCommandSchemas, type CredentialsCommandResults, type CredentialsState } from './credentials';
import { pageToolsCommandSchemas, type PageToolsCommandResults, type TranslationState } from './page-tools';
import { newTabCommandSchemas, type NewTabCommandResults, type NewTabState } from './new-tab';
import { leoCommandSchemas, type LeoCommandResults, type LeoState } from './leo';
import { extensionsCommandSchemas, type ExtensionsCommandResults, type ExtensionsState } from './extensions';
import { shieldsCommandSchemas, type ShieldsCommandResults, type ShieldsState, type ShieldRuleState } from './shields';
import { syncCommandSchemas, type SyncCommandResults, type SyncState } from './sync';
import { privacyCommandSchemas, type PrivacyCommandResults, type PrivacyState } from './fingerprint-privacy';
import type { WireError } from '../errors';

export const WIRE_VERSION = 1;
export const IPC_COMMAND_CHANNEL = 'brave:command';
export const IPC_EVENT_CHANNEL = 'brave:event';
export const commandSchemas = {
  ...browserCommandSchemas, ...tabGroupCommandSchemas,
  ...bookmarkCommandSchemas, ...historyCommandSchemas,
  ...settingsCommandSchemas, ...downloadsCommandSchemas, ...siteSettingsCommandSchemas,
  ...credentialsCommandSchemas, ...pageToolsCommandSchemas, ...newTabCommandSchemas,
  ...leoCommandSchemas, ...extensionsCommandSchemas, ...shieldsCommandSchemas,
  ...syncCommandSchemas,
  ...privacyCommandSchemas,
};
export type CommandName = keyof typeof commandSchemas;
export type CommandInput<Name extends CommandName> = z.input<(typeof commandSchemas)[Name]>;
export type CommandPayload<Name extends CommandName> = z.output<(typeof commandSchemas)[Name]>;
export type CommandResults = BrowserCommandResults & TabGroupCommandResults & BookmarkCommandResults & HistoryCommandResults
  & SettingsCommandResults & DownloadsCommandResults & SiteSettingsCommandResults
  & CredentialsCommandResults & PageToolsCommandResults & NewTabCommandResults
  & LeoCommandResults & ExtensionsCommandResults & ShieldsCommandResults & SyncCommandResults & PrivacyCommandResults;
export type CommandEnvelope = {
  version: typeof WIRE_VERSION; requestId: string; command: CommandName; payload: unknown;
};
export type CommandResult<Value> = { ok: true; value: Value } | { ok: false; error: WireError };
export interface BrowserEvents {
  'browser.state': BrowserSnapshot;
  'browser.shortcut': { action: 'focusAddress' };
  'tabGroups.changed': TabGroupsState;
  'bookmarks.changed': BookmarksState;
  'history.changed': { revision: number };
  'settings.changed': SettingsState;
  'downloads.changed': DownloadsState;
  'siteSettings.changed': SiteSettingsState;
  'credentials.changed': CredentialsState;
  'pageTools.translationChanged': TranslationState;
  'newTab.changed': NewTabState;
  'leo.changed': LeoState;
  'extensions.changed': ExtensionsState;
  'shields.changed': ShieldsState;
  'shields.rulesChanged': ShieldRuleState;
  'sync.changed': SyncState;
  'privacy.changed': PrivacyState;
  'app.error': WireError;
}
export type EventName = keyof BrowserEvents;
export type EventEnvelope<Name extends EventName = EventName> = {
  version: typeof WIRE_VERSION; event: Name; data: BrowserEvents[Name];
};
export type Dispose = () => void;
export interface BrowserBridge {
  command<Name extends CommandName>(name: Name, payload: CommandInput<Name>): Promise<CommandResult<CommandResults[Name]>>;
  subscribe<Name extends EventName>(name: Name, listener: (data: BrowserEvents[Name]) => void): Dispose;
}
