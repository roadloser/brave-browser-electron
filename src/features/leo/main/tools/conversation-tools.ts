import { z } from 'zod';
import type { LeoToolUse } from '../../../../shared/contracts/leo';
import type { ProviderToolCall, ProviderToolDefinition } from '../providers/provider';
import { ProviderFailure } from '../providers/provider';

const choicesSchema = z.object({ choice_type: z.enum(['preference', 'follow_up']), choices: z.array(z.string().min(1).max(2000)).min(1).max(10) }).strict();
const detailSchema = z.object({ information: z.string().min(1).max(30000) }).strict();
export const conversationTools: ProviderToolDefinition[] = [
  { type: 'function', function: { name: 'user_choice_tool',
    description: 'Ask the user to choose a preference needed to continue, or offer relevant follow-up suggestions after completing the answer. Do not replace a full answer with choices.',
    parameters: { type: 'object', properties: { choice_type: { type: 'string', enum: ['preference', 'follow_up'] }, choices: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 } }, required: ['choice_type', 'choices'], additionalProperties: false } } },
  { type: 'function', function: { name: 'assistant_detail_storage',
    description: 'Preserve useful information from recent tool output before it leaves the current conversation context.',
    parameters: { type: 'object', properties: { information: { type: 'string' } }, required: ['information'], additionalProperties: false } } },
];
export function normalizeTool(call: ProviderToolCall): LeoToolUse {
  let input: unknown;
  try { input = JSON.parse(call.arguments); } catch { throw new ProviderFailure('protocol', '工具参数不是有效 JSON'); }
  if (call.name === 'user_choice_tool') return { id: call.id, name: call.name, input: choicesSchema.parse(input), status: 'pending' };
  if (call.name === 'assistant_detail_storage') return { id: call.id, name: call.name, input: detailSchema.parse(input), status: 'completed', output: detailSchema.parse(input).information };
  throw new ProviderFailure('capability', `模型请求了未启用的工具：${call.name}`);
}
