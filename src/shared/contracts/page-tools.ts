import { z } from 'zod';
import { idSchema } from './browser-core';

export type ReaderArticle = { tabId: string; navigationId: string; title: string; byline: string | null; content: string; textContent: string; siteName: string | null; excerpt: string | null };
export type TranslationState = {
  tabId: string; navigationId: string; sourceLanguage: string; targetLanguage: string;
  status: 'idle' | 'translating' | 'translated' | 'cancelled' | 'failed';
  translatedFrames: number; excludedFrames: number; error?: string; revision: number;
};
export const pageToolsCommandSchemas = {
  'pageTools.read': z.object({ tabId: idSchema }),
  'pageTools.translate': z.object({ tabId: idSchema, targetLanguage: z.string().min(2).max(32) }),
  'pageTools.undoTranslation': z.object({ tabId: idSchema }),
  'pageTools.cancelTranslation': z.object({ tabId: idSchema }),
  'pageTools.translationState': z.object({ tabId: idSchema }),
  'pageTools.capture': z.object({ tabId: idSchema, fullPage: z.boolean().default(false) }),
};
export interface PageToolsCommandResults {
  'pageTools.read': ReaderArticle;
  'pageTools.translate': TranslationState;
  'pageTools.undoTranslation': TranslationState;
  'pageTools.cancelTranslation': TranslationState;
  'pageTools.translationState': TranslationState;
  'pageTools.capture': { saved: boolean; path?: string };
}
