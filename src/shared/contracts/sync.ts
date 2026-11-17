import { z } from 'zod';
import { idSchema } from './browser-core';

export const syncDataTypeSchema = z.enum(['bookmarks', 'history', 'settings', 'passwords', 'tabs']);
export type SyncDataType = z.infer<typeof syncDataTypeSchema>;
export type SyncConflict = {
  id: string; dataType: SyncDataType; itemId: string;
  localSummary: string; remoteSummary: string; detectedAt: number;
};
export type SyncState = {
  status: 'disconnected' | 'ready' | 'syncing' | 'paused' | 'error' | 'needs-authorization';
  officialStatus: 'unconfigured' | 'unverified' | 'accepted' | 'rejected';
  deviceName: string; deviceId: string | null; endpoint: string; hasServiceKey: boolean;
  enabledTypes: SyncDataType[];
  capabilities: { dataType: SyncDataType; status: 'implemented' | 'blocked' | 'unknown'; reason?: string }[];
  pending: number; conflicts: SyncConflict[]; lastSync: number | null;
  error?: string; revision: number;
  remoteDevices: { id: string; name: string; lastSeen: number }[];
  remoteTabs: { deviceId: string; tabId: string; title: string; url: string; lastModified: number }[];
};
export type SyncCode = { code: string; expiresAt: number };
export const syncCommandSchemas = {
  'sync.get': z.object({}),
  'sync.configure': z.object({
    endpoint: z.string().url().max(2048), serviceKey: z.string().max(16384).optional(),
    deviceName: z.string().trim().min(1).max(128),
  }),
  'sync.createChain': z.object({ confirmed: z.literal(true) }),
  'sync.joinChain': z.object({ code: z.string().trim().min(20).max(1024) }),
  'sync.showCode': z.object({ confirmed: z.literal(true) }),
  'sync.setTypes': z.object({ enabledTypes: z.array(syncDataTypeSchema).max(5) }),
  'sync.run': z.object({}),
  'sync.cancel': z.object({}),
  'sync.leave': z.object({ confirmed: z.literal(true) }),
  'sync.resolveConflict': z.object({ id: idSchema, keep: z.enum(['local', 'remote']) }),
  'sync.openRemoteTab': z.object({ deviceId: idSchema, tabId: idSchema }),
};
export interface SyncCommandResults {
  'sync.get': SyncState;
  'sync.configure': SyncState;
  'sync.createChain': SyncCode;
  'sync.joinChain': SyncState;
  'sync.showCode': SyncCode;
  'sync.setTypes': SyncState;
  'sync.run': SyncState;
  'sync.cancel': SyncState;
  'sync.leave': SyncState;
  'sync.resolveConflict': SyncState;
  'sync.openRemoteTab': void;
}
