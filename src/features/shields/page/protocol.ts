export const SHIELDS_COSMETIC_CHANNEL = 'brave:shields:cosmetic';
export const SHIELDS_INVALIDATE_CHANNEL = 'brave:shields:invalidate';
export type CosmeticFeatures = { initial: boolean; classes: string[]; ids: string[]; hrefs: string[] };
export type CosmeticPagePlan = {
  active: boolean; styles: string; scripts: string[];
  procedural: { providerId: string; payload: string }[];
};
export interface CosmeticRuntimePort {
  start(onFeatures: (features: CosmeticFeatures) => void): void;
  apply(plan: CosmeticPagePlan): void;
  dispose(): void;
}
