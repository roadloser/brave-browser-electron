import { z } from 'zod';
import { idSchema } from './browser-core';
import { originSchema } from './site-settings';

export type CredentialSummary = { id: string; origin: string; username: string; createdAt: number; updatedAt: number };
export type CredentialCandidate = { id: string; tabId: string; origin: string; username: string; existingId?: string };
export type CredentialsState = { entries: CredentialSummary[]; candidates: CredentialCandidate[]; available: boolean; reason?: string; revision: number };
export const credentialsCommandSchemas = {
  'credentials.list': z.object({}),
  'credentials.save': z.object({ origin: originSchema, username: z.string().max(2048), password: z.string().min(1).max(16384) }),
  'credentials.capture': z.object({ tabId: idSchema }),
  'credentials.confirm': z.object({ candidateId: idSchema, save: z.boolean() }),
  'credentials.fill': z.object({ tabId: idSchema, credentialId: idSchema }),
  'credentials.remove': z.object({ id: idSchema }),
};
export interface CredentialsCommandResults {
  'credentials.list': CredentialsState;
  'credentials.save': CredentialsState;
  'credentials.capture': CredentialsState;
  'credentials.confirm': CredentialsState;
  'credentials.fill': { filled: boolean };
  'credentials.remove': CredentialsState;
}
