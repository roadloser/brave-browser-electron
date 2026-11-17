import type { BrowserWindow, OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, Session, WebContents } from 'electron';
import type { BrowserContext, BrowserSnapshot, CoreEvent, BrowserLayout, ProfileSnapshot, TabSnapshot, WindowSnapshot } from './contracts/browser-core';
import type { Dispose } from './contracts/envelope';
import type { BrowserSettings } from './contracts/settings';

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlParameters = readonly SqlValue[] | Record<string, SqlValue>;
export interface ProfileDatabase {
  get<Row>(sql: string, parameters?: SqlParameters): Row | undefined;
  all<Row>(sql: string, parameters?: SqlParameters): Row[];
  run(sql: string, parameters?: SqlParameters): { changes: number; lastInsertRowid: number | bigint };
  exec(sql: string): void;
  transaction<Value>(operation: () => Value): Value;
}
export type Migration = { id: string; version: number; up: (database: ProfileDatabase) => void };
export interface StorageHost {
  open(profileId: string): ProfileDatabase;
  migrate(profileId: string, migrations: readonly Migration[]): void;
  close(profileId?: string): void;
  remove(profileId: string): void;
}
export type PageTarget = { tabId: string; navigationId: string; origin: string; frame?: { processId: number; routingId: number } };
export interface PageScriptPort {
  register(id: string, script: { world: 'isolated' | 'main'; source: (argumentsValue: unknown) => string }): Dispose;
  execute<Result>(id: string, target: PageTarget, argumentsValue: unknown): Promise<Result>;
}
export interface SecretStorePort {
  available(): boolean;
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
export type RequestDecision = { cancel?: boolean; redirectURL?: string };
export interface RequestHostPort {
  attach(browserSession: Session, evaluate: (details: OnBeforeRequestListenerDetails) => RequestDecision | Promise<RequestDecision>, onError: (error: unknown) => void): Dispose;
  attachHeaders(browserSession: Session, policy: (details: OnBeforeSendHeadersListenerDetails) => Record<string, string>): Dispose;
}
export interface BrowserCorePort {
  getProfiles(): ProfileSnapshot[];
  configureProfile(profileId: string, settings: Pick<BrowserSettings, 'startup' | 'searchEngine' | 'verticalTabs'>): void;
  getState(windowId: string): BrowserSnapshot;
  getWindow(windowId: string): WindowSnapshot;
  getTab(tabId: string): TabSnapshot;
  getWindowForSender(webContentsId: number): WindowSnapshot | undefined;
  getNativeWindow(windowId: string): BrowserWindow;
  getTabWebContents(tabId: string): WebContents;
  sessionForContext(context: BrowserContext): Session;
  getContexts(): BrowserContext[];
  onEvent(listener: (event: CoreEvent) => void): Dispose;
  openWindow(options?: { profileId?: string; isPrivate?: boolean }): Promise<WindowSnapshot>;
  createProfile(name: string): ProfileSnapshot;
  renameProfile(profileId: string, name: string): ProfileSnapshot;
  deleteProfile(profileId: string, confirmName: string): Promise<void>;
  closeWindow(windowId: string): void;
  openTab(options: { windowId: string; url?: string; active?: boolean; pinned?: boolean }): Promise<TabSnapshot>;
  selectTab(tabId: string): void;
  closeTab(tabId: string): void;
  navigate(tabId: string, input: string): Promise<void>;
  goBack(tabId: string): void;
  goForward(tabId: string): void;
  reload(tabId: string, bypassCache?: boolean): void;
  stop(tabId: string): void;
  moveTab(tabId: string, index: number): void;
  pinTab(tabId: string, pinned: boolean): void;
  muteTab(tabId: string, muted: boolean): void;
  duplicateTab(tabId: string): Promise<TabSnapshot>;
  reopenClosedTab(windowId: string): Promise<TabSnapshot | null>;
  setLayout(windowId: string, layout: Partial<BrowserLayout>): void;
  windowAction(windowId: string, action: 'minimize' | 'maximize' | 'restore' | 'close'): void;
  restore(): Promise<void>;
  dispose(): Promise<void> | void;
}
