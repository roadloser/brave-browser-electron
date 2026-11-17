import { z } from 'zod';

export const idSchema = z.string().min(1).max(128);
export const urlInputSchema = z.string().trim().min(1).max(32768);
export const rectangleSchema = z.object({
  x: z.number().finite().min(0), y: z.number().finite().min(0),
  width: z.number().finite().min(0), height: z.number().finite().min(0),
});
export type Rectangle = z.infer<typeof rectangleSchema>;
export type BrowserContext = { profileId: string; contextId: string; isPrivate: boolean; kind?: 'regular' | 'private' | 'tor' };
export type ProfileSnapshot = { id: string; name: string; isDefault: boolean };
export type TabSnapshot = BrowserContext & {
  id: string; windowId: string; url: string; title: string; faviconUrl?: string;
  loading: boolean; canGoBack: boolean; canGoForward: boolean;
  pinned: boolean; muted: boolean; audible: boolean; crashed: boolean;
  error?: string; navigationId: string; revision: number;
};
export const layoutSchema = z.object({
  viewport: rectangleSchema,
  verticalTabs: z.boolean(),
  splitTabIds: z.array(idSchema).max(2),
  splitRatio: z.number().min(0.15).max(0.85),
  sidebarTabId: idSchema.nullable(),
  sidebarWidth: z.number().min(180).max(800),
  contentVisible: z.boolean(),
});
export type BrowserLayout = z.infer<typeof layoutSchema>;
export type WindowSnapshot = BrowserContext & {
  id: string; tabs: TabSnapshot[]; activeTabId: string | null; ready: boolean;
  layout: BrowserLayout; maximized: boolean; fullscreen: boolean; revision: number;
};
export type BrowserSnapshot = {
  profiles: ProfileSnapshot[]; windows: WindowSnapshot[];
  currentWindowId: string; revision: number;
};
export type NavigationCommitted = BrowserContext & {
  windowId: string; tabId: string; url: string; title: string;
  navigationId: string; revision: number; timestamp: number;
  source: 'navigation' | 'reload' | 'history' | 'same-document';
};
export type CoreEvent =
  | { type: 'stateChanged'; windowId: string; state: BrowserSnapshot }
  | { type: 'shortcut'; windowId: string; action: 'focusAddress' | 'findInPage' }
  | { type: 'findResult'; windowId: string; result: import('./browser-actions').FindResult }
  | { type: 'windowReady'; windowId: string; context: BrowserContext }
  | { type: 'navigationCommitted'; visit: NavigationCommitted }
  | { type: 'frameOriginObserved'; context: BrowserContext; windowId: string; tabId: string; origin: string; timestamp: number }
  | { type: 'zoomChanged'; context: BrowserContext; windowId: string; tabId: string; factor: number }
  | { type: 'tabClosed'; context: BrowserContext; windowId: string; tabId: string }
  | { type: 'sessionCreated'; context: BrowserContext }
  | { type: 'contextDisposed'; context: BrowserContext };

const tabTarget = z.object({ tabId: idSchema });
export const browserCommandSchemas = {
  'browser.getState': z.object({}),
  'browser.openWindow': z.object({ isPrivate: z.boolean().optional(), profileId: idSchema.optional() }),
  'browser.createProfile': z.object({ name: z.string().trim().min(1).max(80) }),
  'browser.renameProfile': z.object({ profileId: idSchema, name: z.string().trim().min(1).max(80) }),
  'browser.deleteProfile': z.object({ profileId: idSchema, confirmName: z.string().min(1).max(80) }),
  'browser.closeWindow': z.object({}),
  'browser.openTab': z.object({ url: urlInputSchema.optional(), active: z.boolean().optional(), pinned: z.boolean().optional() }),
  'browser.openFile': z.object({}),
  'browser.selectTab': tabTarget,
  'browser.closeTab': tabTarget,
  'browser.navigate': tabTarget.extend({ url: urlInputSchema }),
  'browser.back': tabTarget,
  'browser.forward': tabTarget,
  'browser.reload': tabTarget.extend({ bypassCache: z.boolean().optional() }),
  'browser.stop': tabTarget,
  'browser.moveTab': tabTarget.extend({ index: z.number().int().min(0) }),
  'browser.pinTab': tabTarget.extend({ pinned: z.boolean() }),
  'browser.muteTab': tabTarget.extend({ muted: z.boolean() }),
  'browser.duplicateTab': tabTarget,
  'browser.reopenClosedTab': z.object({}),
  'browser.setLayout': layoutSchema.partial(),
  'browser.windowAction': z.object({ action: z.enum(['minimize', 'maximize', 'restore', 'close']) }),
};
export interface BrowserCommandResults {
  'browser.getState': BrowserSnapshot;
  'browser.openWindow': WindowSnapshot;
  'browser.createProfile': ProfileSnapshot;
  'browser.renameProfile': ProfileSnapshot;
  'browser.deleteProfile': void;
  'browser.closeWindow': void;
  'browser.openTab': TabSnapshot;
  'browser.openFile': TabSnapshot | null;
  'browser.selectTab': void;
  'browser.closeTab': void;
  'browser.navigate': void;
  'browser.back': void;
  'browser.forward': void;
  'browser.reload': void;
  'browser.stop': void;
  'browser.moveTab': void;
  'browser.pinTab': void;
  'browser.muteTab': void;
  'browser.duplicateTab': TabSnapshot;
  'browser.reopenClosedTab': TabSnapshot | null;
  'browser.setLayout': void;
  'browser.windowAction': void;
}
