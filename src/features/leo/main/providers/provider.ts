import type { ModelConfiguration } from '../../../../shared/contracts/leo';

export type ProviderContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
export type ProviderToolCall = { id: string; name: string; arguments: string };
export type ProviderToolDefinition = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ProviderMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'; content: ProviderContent; tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};
export type ProviderResponse = { text: string; toolCalls: ProviderToolCall[] };
export type ProviderFailureKind = 'credentials' | 'rate-limit' | 'network' | 'protocol' | 'cancelled' | 'capability';
export class ProviderFailure extends Error {
  constructor(public readonly kind: ProviderFailureKind, message: string, public readonly retryAfter?: number) {
    super(message); this.name = 'ProviderFailure';
  }
}
export interface ProviderRequest {
  model: ModelConfiguration;
  apiKey?: string;
  messages: ProviderMessage[];
  signal: AbortSignal;
  onText: (text: string) => void;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  tools?: ProviderToolDefinition[];
}
export interface ProviderPort {
  readonly id: 'custom' | 'brave';
  readonly adapterVersion: string;
  availability(): { available: boolean; reason?: string };
  send(request: ProviderRequest): Promise<ProviderResponse>;
  dispose(): void;
}
