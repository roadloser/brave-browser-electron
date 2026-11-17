import { z } from 'zod';
import { idSchema } from './browser-core';

export type FindResult = { tabId: string; requestId: number; matches: number; activeMatchOrdinal: number; finalUpdate: boolean };
export const browserActionCommandSchemas = {
  'browser.find': z.object({ tabId: idSchema, text: z.string().min(1).max(8192), forward: z.boolean().default(true), findNext: z.boolean().default(false), matchCase: z.boolean().default(false) }),
  'browser.stopFind': z.object({ tabId: idSchema }),
  'browser.zoom': z.object({ tabId: idSchema, action: z.enum(['in', 'out', 'reset']) }),
  'browser.getZoom': z.object({ tabId: idSchema }),
  'browser.print': z.object({ tabId: idSchema }),
};
export interface BrowserActionCommandResults {
  'browser.find': { requestId: number };
  'browser.stopFind': void;
  'browser.zoom': { factor: number };
  'browser.getZoom': { factor: number };
  'browser.print': { success: boolean; failureReason?: string };
}
