type Counters = { navigationId: string; blocked: number; categories: Record<string, number> };

export class DecisionRecorder {
  private readonly counters = new Map<string, Counters>();
  reset(tabId: string, navigationId: string): void {
    const current = this.counters.get(tabId);
    if (current?.navigationId !== navigationId) this.counters.set(tabId, { navigationId, blocked: 0, categories: {} });
  }
  record(tabId: string, navigationId: string, category: string): void {
    this.reset(tabId, navigationId);
    const current = this.counters.get(tabId)!;
    current.blocked++;
    current.categories[category] = (current.categories[category] ?? 0) + 1;
  }
  get(tabId: string) { const value = this.counters.get(tabId); return { blocked: value?.blocked ?? 0, categories: { ...value?.categories } }; }
  remove(tabId: string): void { this.counters.delete(tabId); }
  dispose(): void { this.counters.clear(); }
}
