import type { BookmarkNode } from './contracts/bookmarks';
import type { HistoryEntry } from './contracts/history';
import type { BrowserSettings } from './contracts/settings';
import type { Dispose } from './contracts/envelope';

export type SyncLocalType = 'bookmarks' | 'history' | 'settings';
export type SyncLocalItem =
  | { type: 'bookmarks'; id: string; value: BookmarkNode }
  | { type: 'history'; id: string; value: HistoryEntry }
  | { type: 'settings'; id: string; value: { name: keyof BrowserSettings; value: BrowserSettings[keyof BrowserSettings]; updatedAt: number } };
export type SyncLocalChange =
  | { operation: 'upsert'; item: SyncLocalItem }
  | { operation: 'delete'; type: SyncLocalType; id: string };
export interface SyncDataAdapter {
  snapshot(profileId: string): SyncLocalItem[];
  apply(profileId: string, changes: readonly SyncLocalChange[]): void;
  notify(profileId: string): void;
  subscribe(listener: (profileId: string) => void): Dispose;
}
export interface SyncDataPort {
  register(type: SyncLocalType, adapter: SyncDataAdapter): Dispose;
  snapshot(profileId: string, type: SyncLocalType): SyncLocalItem[];
  apply(profileId: string, changes: readonly SyncLocalChange[]): void;
  notify(profileId: string, types: readonly SyncLocalType[]): void;
  subscribe(listener: (profileId: string, type: SyncLocalType) => void): Dispose;
}
