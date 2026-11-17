import type { ReaderArticle, TranslationState } from '../../../../shared/contracts/page-tools';
import type { PageTarget } from '../../../../shared/runtime-ports';

export type AdapterCapability = { implementation: string; version: string; scope: 'main-frame'; limitations: string[] };
export type ExtractedArticle = Omit<ReaderArticle, 'tabId' | 'navigationId'>;
export interface ReaderAdapterPort {
  readonly capability: AdapterCapability;
  extract(target: PageTarget): Promise<ExtractedArticle | null>;
  dispose(): void;
}
export type TranslationRuntimeState = { status: TranslationState['status']; sourceLanguage: string; error?: string };
export interface TranslationAdapterPort {
  readonly capability: AdapterCapability;
  available(): { available: boolean; reason?: string };
  start(target: PageTarget, language: string, signal: AbortSignal, generation: number): Promise<TranslationRuntimeState>;
  state(target: PageTarget, generation: number): Promise<TranslationRuntimeState | null>;
  restore(target: PageTarget, cancel: boolean, generation: number): Promise<void>;
  dispose(): void;
}
export interface CaptureAdapterPort {
  capture(tabId: string, fullPage: boolean): Promise<Uint8Array>;
}
