import { z } from 'zod';
import { idSchema } from './browser-core';

export const groupColorSchema = z.enum(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);
export type GroupColor = z.infer<typeof groupColorSchema>;
export type TabGroup = {
  id: string; windowId: string; name: string; color: GroupColor;
  collapsed: boolean; tabIds: string[]; position: number; revision: number;
};
export type TabGroupsState = { groups: TabGroup[]; revision: number };
export const tabGroupCommandSchemas = {
  'tabGroups.list': z.object({}),
  'tabGroups.create': z.object({ name: z.string().max(128), color: groupColorSchema, tabIds: z.array(idSchema).min(1) }),
  'tabGroups.update': z.object({ groupId: idSchema, name: z.string().max(128).optional(), color: groupColorSchema.optional(), collapsed: z.boolean().optional() }),
  'tabGroups.moveTab': z.object({ tabId: idSchema, groupId: idSchema.nullable(), index: z.number().int().min(0).optional() }),
  'tabGroups.ungroup': z.object({ groupId: idSchema }),
  'tabGroups.close': z.object({ groupId: idSchema }),
};
export interface TabGroupCommandResults {
  'tabGroups.list': TabGroupsState;
  'tabGroups.create': TabGroupsState;
  'tabGroups.update': TabGroupsState;
  'tabGroups.moveTab': TabGroupsState;
  'tabGroups.ungroup': TabGroupsState;
  'tabGroups.close': TabGroupsState;
}
