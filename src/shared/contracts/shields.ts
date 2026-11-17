import { z } from 'zod';
import { idSchema } from './browser-core';
import { originSchema } from './site-settings';

export const shieldsPolicySchema = z.object({
  enabled: z.boolean(), blocking: z.enum(['standard', 'aggressive']),
  blockScripts: z.boolean(), httpsUpgrade: z.boolean(),
});
export type ShieldsPolicy = z.infer<typeof shieldsPolicySchema>;
export type ShieldsState = {
  tabId: string; origin: string; policy: ShieldsPolicy; blocked: number;
  categories: Record<string, number>; ruleVersion: string | null;
  engine: { status: 'unconfigured' | 'loading' | 'ready' | 'failed'; name: string | null; error?: string };
  revision: number;
};
export type ShieldRuleState = { version: string | null; previousVersion: string | null; updatedAt: number | null; status: 'idle' | 'updating' | 'ready' | 'failed'; error?: string; revision: number };
export const shieldsCommandSchemas = {
  'shields.get': z.object({ tabId: idSchema }),
  'shields.setPolicy': z.object({ origin: originSchema, policy: shieldsPolicySchema }),
  'shields.resetPolicy': z.object({ origin: originSchema }),
  'shields.rules': z.object({}),
  'shields.updateRules': z.object({}),
  'shields.cancelUpdate': z.object({}),
  'shields.rollbackRules': z.object({}),
};
export interface ShieldsCommandResults {
  'shields.get': ShieldsState;
  'shields.setPolicy': ShieldsState[];
  'shields.resetPolicy': ShieldsState[];
  'shields.rules': ShieldRuleState;
  'shields.updateRules': ShieldRuleState;
  'shields.cancelUpdate': ShieldRuleState;
  'shields.rollbackRules': ShieldRuleState;
}
