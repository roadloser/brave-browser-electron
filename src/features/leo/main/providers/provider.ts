import type { ModelConfiguration } from '../../../../shared/contracts/leo';

export type ProviderMessage = { role: 'system' | 'user' | 'assistant'; content: string };
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
}
export interface ProviderPort {
  readonly id: 'custom' | 'brave';
  readonly adapterVersion: string;
  availability(): { available: boolean; reason?: string };
  send(request: ProviderRequest): Promise<void>;
  dispose(): void;
}
