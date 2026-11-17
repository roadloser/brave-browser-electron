import { z } from 'zod';
import { idSchema } from './browser-core';

export type DownloadRecord = {
  id: string; url: string; filename: string; savePath: string; mimeType: string;
  state: 'progressing' | 'paused' | 'interrupted' | 'completed' | 'cancelled';
  receivedBytes: number; totalBytes: number; startedAt: number; updatedAt: number;
  canResume: boolean; fileExists: boolean; error?: string;
};
export type DownloadsState = { items: DownloadRecord[]; revision: number };
export const downloadsCommandSchemas = {
  'downloads.list': z.object({}),
  'downloads.pause': z.object({ id: idSchema }),
  'downloads.resume': z.object({ id: idSchema }),
  'downloads.cancel': z.object({ id: idSchema }),
  'downloads.retry': z.object({ id: idSchema }),
  'downloads.open': z.object({ id: idSchema }),
  'downloads.showInFolder': z.object({ id: idSchema }),
  'downloads.remove': z.object({ id: idSchema }),
  'downloads.clearFinished': z.object({}),
};
export interface DownloadsCommandResults {
  'downloads.list': DownloadsState;
  'downloads.pause': DownloadsState;
  'downloads.resume': DownloadsState;
  'downloads.cancel': DownloadsState;
  'downloads.retry': DownloadsState;
  'downloads.open': void;
  'downloads.showInFolder': void;
  'downloads.remove': DownloadsState;
  'downloads.clearFinished': DownloadsState;
}
