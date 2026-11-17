import { z } from 'zod';
import { idSchema } from './browser-core';

export const originSchema = z.string().url().refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, '需要准确的 HTTP(S) origin');
export const sitePermissionSchema = z.enum(['notifications', 'geolocation', 'camera', 'microphone', 'clipboard-read', 'midi', 'fullscreen', 'pointerLock']);
export type SitePermission = z.infer<typeof sitePermissionSchema>;
export type SiteRule = { origin: string; permission: SitePermission; decision: 'allow' | 'deny'; updatedAt: number };
export type PermissionPrompt = { id: string; tabId: string; origin: string; topLevelOrigin: string; permission: SitePermission; requestedAt: number };
export type SiteSettingsState = { rules: SiteRule[]; prompts: PermissionPrompt[]; revision: number };
export const siteSettingsCommandSchemas = {
  'siteSettings.get': z.object({ origin: originSchema.optional() }),
  'siteSettings.set': z.object({ origin: originSchema, permission: sitePermissionSchema, decision: z.enum(['allow', 'deny', 'ask']) }),
  'siteSettings.resolve': z.object({ id: idSchema, allow: z.boolean(), remember: z.boolean() }),
  'siteSettings.clearData': z.object({ origin: originSchema.optional(), cookies: z.boolean(), cache: z.boolean(), localStorage: z.boolean() }),
};
export interface SiteSettingsCommandResults {
  'siteSettings.get': SiteSettingsState;
  'siteSettings.set': SiteSettingsState;
  'siteSettings.resolve': SiteSettingsState;
  'siteSettings.clearData': { cleared: boolean };
}
