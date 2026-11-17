import { z } from 'zod';

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  startup: z.enum(['restore', 'new-tab']),
  searchEngine: z.enum(['brave', 'google', 'duckduckgo', 'bing']),
  showBookmarksBar: z.boolean(),
  verticalTabs: z.boolean(),
  downloadAskEachTime: z.boolean(),
  downloadDirectory: z.string().max(4096),
  savePasswords: z.boolean(),
  autofillEnabled: z.boolean(),
  doNotTrack: z.boolean(),
});
export type BrowserSettings = z.infer<typeof settingsSchema>;
export type SettingsState = { values: BrowserSettings; revision: number };
export const settingsCommandSchemas = {
  'settings.get': z.object({}),
  'settings.update': settingsSchema.partial(),
  'settings.reset': z.object({}),
  'settings.chooseDownloadDirectory': z.object({}),
};
export interface SettingsCommandResults {
  'settings.get': SettingsState;
  'settings.update': SettingsState;
  'settings.reset': SettingsState;
  'settings.chooseDownloadDirectory': SettingsState;
}
