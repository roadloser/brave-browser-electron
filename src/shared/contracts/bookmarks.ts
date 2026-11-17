import { z } from 'zod';
import { idSchema, urlInputSchema } from './browser-core';

export type BookmarkNode = {
  id: string; parentId: string | null; kind: 'folder' | 'bookmark';
  title: string; url: string | null; position: number; createdAt: number; updatedAt: number;
};
export type BookmarksState = { nodes: BookmarkNode[]; revision: number };
export const bookmarkCommandSchemas = {
  'bookmarks.list': z.object({ query: z.string().max(2048).optional() }),
  'bookmarks.create': z.object({
    parentId: idSchema.nullable(), kind: z.enum(['folder', 'bookmark']),
    title: z.string().trim().min(1).max(2048), url: urlInputSchema.optional(),
  }),
  'bookmarks.update': z.object({ id: idSchema, title: z.string().trim().min(1).max(2048), url: urlInputSchema.optional() }),
  'bookmarks.move': z.object({ id: idSchema, parentId: idSchema.nullable(), index: z.number().int().min(0) }),
  'bookmarks.remove': z.object({ id: idSchema }),
  'bookmarks.addCurrentTab': z.object({ tabId: idSchema, parentId: idSchema.nullable() }),
};
export interface BookmarkCommandResults {
  'bookmarks.list': BookmarksState;
  'bookmarks.create': BookmarksState;
  'bookmarks.update': BookmarksState;
  'bookmarks.move': BookmarksState;
  'bookmarks.remove': BookmarksState;
  'bookmarks.addCurrentTab': BookmarksState;
}
