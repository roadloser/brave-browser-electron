export type FilterRequest = {
  id: string; url: string; sourceUrl: string | null; type: string; method: string; tabId?: number;
};
export type FilterDecision = {
  action: 'allow' | 'block' | 'redirect'; redirectUrl?: string; rule?: string; exception?: string; category: string;
};
export type CosmeticInput = {
  url: string; classes: string[]; ids: string[]; hrefs: string[]; initial: boolean; aggressive: boolean;
};
export type CosmeticPlan = {
  active: boolean; styles: string; scripts: string[];
  procedural: { providerId: string; payload: string }[];
};
export type FilterEngineCapabilities = {
  network: boolean; csp: boolean; cosmetics: boolean; scriptlets: boolean; procedural: boolean;
  requestMethod: boolean; braveRuleParity: boolean;
};
export type RuleText = { id: string; url: string; text: string; sha256: string };
export type RuleBundle = { version: string; createdAt: number; lists: RuleText[]; resources: RuleText };
export type EngineCache = { engineId: string; engineVersion: string; schema: number; ruleVersion: string; bytes: Uint8Array };
export interface FilterEnginePort {
  readonly id: string;
  readonly version: string;
  readonly capabilities: FilterEngineCapabilities;
  match(request: FilterRequest): FilterDecision;
  csp(request: FilterRequest): string | undefined;
  cosmetic(input: CosmeticInput): CosmeticPlan;
  resources(source: RuleText): void;
  serialize(ruleVersion: string): EngineCache;
  dispose(): void;
}
export interface FilterEngineFactoryPort {
  readonly id: string;
  readonly version: string;
  load(bundle: RuleBundle, cache?: EngineCache): FilterEnginePort;
}
