import type { EngineCache, FilterEngineFactoryPort, FilterEnginePort, RuleBundle } from './engine-port';
import { ghosteryFactory } from './ghostery-adapter';

export class FilterEngine {
  private current: FilterEnginePort | null = null;
  constructor(private readonly factory: FilterEngineFactoryPort = ghosteryFactory) {}
  get active(): FilterEnginePort | null { return this.current; }
  prepare(bundle: RuleBundle, cache?: EngineCache): FilterEnginePort { return this.factory.load(bundle, cache); }
  activate(candidate: FilterEnginePort): void { const previous = this.current; this.current = candidate; previous?.dispose(); }
  dispose(): void { this.current?.dispose(); this.current = null; }
}
