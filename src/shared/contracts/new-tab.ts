import { z } from 'zod';
import { idSchema, urlInputSchema } from './browser-core';

export type Shortcut = { id: string; title: string; url: string; position: number };
export const backgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gradient'), value: z.enum(['dusk', 'ocean', 'forest', 'sunrise']) }),
  z.object({ kind: z.literal('color'), value: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  z.object({ kind: z.literal('image'), value: idSchema }),
]);
export type NewTabPreferences = { background: z.infer<typeof backgroundSchema>; showClock: boolean; showShortcuts: boolean; shortcuts: Shortcut[] };
export type NewTabState = { preferences: NewTabPreferences; images: { id: string; name: string; dataUrl: string }[]; revision: number };
export const newTabCommandSchemas = {
  'newTab.get': z.object({}),
  'newTab.update': z.object({ background: backgroundSchema.optional(), showClock: z.boolean().optional(), showShortcuts: z.boolean().optional() }),
  'newTab.addShortcut': z.object({ title: z.string().min(1).max(128), url: urlInputSchema }),
  'newTab.updateShortcut': z.object({ id: idSchema, title: z.string().min(1).max(128), url: urlInputSchema }),
  'newTab.removeShortcut': z.object({ id: idSchema }),
  'newTab.moveShortcut': z.object({ id: idSchema, index: z.number().int().min(0) }),
  'newTab.chooseBackground': z.object({}),
  'newTab.removeBackground': z.object({ id: idSchema }),
};
export interface NewTabCommandResults {
  'newTab.get': NewTabState;
  'newTab.update': NewTabState;
  'newTab.addShortcut': NewTabState;
  'newTab.updateShortcut': NewTabState;
  'newTab.removeShortcut': NewTabState;
  'newTab.moveShortcut': NewTabState;
  'newTab.chooseBackground': NewTabState;
  'newTab.removeBackground': NewTabState;
}
