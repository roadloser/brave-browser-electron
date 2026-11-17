import { z } from 'zod';
import { idSchema } from './browser-core';

export const modelConfigurationSchema = z.object({
  id: idSchema, name: z.string().trim().min(1).max(128),
  provider: z.enum(['custom', 'brave']),
  endpoint: z.string().url().max(2048), model: z.string().trim().min(1).max(256),
  stream: z.boolean(), contextWindow: z.number().int().min(1024).max(2000000),
  supportsVision: z.boolean(), supportsTools: z.boolean(),
});
export type ModelConfiguration = z.infer<typeof modelConfigurationSchema> & { hasKey: boolean };
export type LeoMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: number; status: 'completed' | 'streaming' | 'cancelled' | 'failed' };
export type LeoConversation = { id: string; title: string; modelId: string; messages: LeoMessage[]; updatedAt: number };
export type LeoState = {
  models: ModelConfiguration[]; conversations: LeoConversation[];
  activeRequests: { id: string; conversationId: string; status: 'running' | 'cancelled' | 'failed'; error?: string }[];
  official: { status: 'unconfigured' | 'configured' | 'unauthorized' | 'unavailable'; reason?: string };
  revision: number;
};
export type ContentGrant = { id: string; tabId: string; navigationId: string; origin: string; title: string; expiresAt: number };
export const leoCommandSchemas = {
  'leo.get': z.object({}),
  'leo.saveModel': modelConfigurationSchema.extend({ apiKey: z.string().max(16384).optional() }),
  'leo.removeModel': z.object({ id: idSchema }),
  'leo.grantContent': z.object({ tabId: idSchema, scope: z.enum(['article', 'selection']), confirmed: z.literal(true) }),
  'leo.revokeContent': z.object({ grantId: idSchema }),
  'leo.send': z.object({ conversationId: idSchema.optional(), modelId: idSchema, text: z.string().trim().min(1).max(100000), grantId: idSchema.optional() }),
  'leo.cancel': z.object({ requestId: idSchema }),
  'leo.removeConversation': z.object({ id: idSchema }),
  'leo.clearConversations': z.object({}),
};
export interface LeoCommandResults {
  'leo.get': LeoState;
  'leo.saveModel': LeoState;
  'leo.removeModel': LeoState;
  'leo.grantContent': ContentGrant;
  'leo.revokeContent': void;
  'leo.send': { requestId: string; conversationId: string };
  'leo.cancel': void;
  'leo.removeConversation': LeoState;
  'leo.clearConversations': LeoState;
}
