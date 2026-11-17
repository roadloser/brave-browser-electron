import { z } from 'zod';
import { idSchema } from './browser-core';

export type HistoryEntry = { id: string; url: string; title: string; visitedAt: number; visitCount: number };
export type HistoryPage = { entries: HistoryEntry[]; total: number; revision: number; nextOffset: number | null };
export const historyCommandSchemas = {
  'history.query': z.object({
    query: z.string().max(2048).optional(), from: z.number().nonnegative().optional(),
    to: z.number().nonnegative().optional(), offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(200).default(100),
  }),
  'history.remove': z.object({ ids: z.array(idSchema).min(1).max(1000) }),
  'history.clear': z.object({ from: z.number().nonnegative().optional(), to: z.number().nonnegative().optional() }),
};
export interface HistoryCommandResults {
  'history.query': HistoryPage;
  'history.remove': { removed: number; revision: number };
  'history.clear': { removed: number; revision: number };
}
