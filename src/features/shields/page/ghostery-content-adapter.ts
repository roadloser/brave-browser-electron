import { DOMMonitor } from '@ghostery/adblocker-content';
import { querySelectorAll, handlePseudoDirective, type AST } from '@ghostery/adblocker-extended-selectors';
import type { CosmeticFeatures, CosmeticPagePlan, CosmeticRuntimePort } from './protocol';

type ProceduralRule = { ast: AST; directive?: AST; attribute?: string; id: number };

export class GhosteryContentAdapter implements CosmeticRuntimePort {
  private monitor?: DOMMonitor;
  private readonly styles = new Set<string>();
  private readonly procedural = new Map<number, ProceduralRule>();
  private readonly previousDisplay = new Map<HTMLElement, { value: string; priority: string }>();
  private readonly styleElement = document.createElement('style');
  private active = true;

  start(onFeatures: (features: CosmeticFeatures) => void): void {
    this.styleElement.dataset.braveElectronShields = 'cosmetic';
    onFeatures({ initial: true, classes: [], ids: [], hrefs: [] });
    this.monitor = new DOMMonitor(update => {
      if (!this.active) return;
      if (update.type === 'features') onFeatures({ initial: false, classes: update.classes.slice(0, 20_000), ids: update.ids.slice(0, 20_000), hrefs: update.hrefs.slice(0, 20_000) });
      if (update.type === 'elements') this.applyProcedural();
    });
    const ready = () => {
      if (!this.active) return;
      (document.head ?? document.documentElement)?.appendChild(this.styleElement);
      this.monitor?.queryAll(window);
      this.monitor?.start(window);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
  }

  apply(plan: CosmeticPagePlan): void {
    if (!plan.active) { this.clear(); return; }
    if (!this.styleElement.isConnected) (document.head ?? document.documentElement)?.appendChild(this.styleElement);
    if (plan.styles && !this.styles.has(plan.styles)) {
      this.styles.add(plan.styles);
      this.styleElement.textContent = [...this.styles].join('\n');
    }
    for (const item of plan.procedural) {
      if (item.providerId !== 'ghostery-extended@2.20.3') continue;
      const rule = JSON.parse(item.payload) as ProceduralRule;
      if (typeof rule.id === 'number' && rule.ast) this.procedural.set(rule.id, rule);
    }
    this.applyProcedural();
  }

  dispose(): void { this.active = false; this.monitor?.stop(); this.clear(); }

  private applyProcedural(): void {
    if (!document.documentElement) return;
    for (const rule of this.procedural.values()) {
      try {
        for (const element of querySelectorAll(document.documentElement, rule.ast)) {
          if (rule.directive) handlePseudoDirective(element, rule.directive);
          else if (element instanceof HTMLElement) {
            if (!this.previousDisplay.has(element)) this.previousDisplay.set(element, { value: element.style.getPropertyValue('display'), priority: element.style.getPropertyPriority('display') });
            element.style.setProperty('display', 'none', 'important');
          }
        }
      } catch {}
    }
  }

  private clear(): void {
    this.styleElement.remove(); this.styles.clear(); this.procedural.clear();
    for (const [element, original] of this.previousDisplay) {
      if (original.value) element.style.setProperty('display', original.value, original.priority);
      else element.style.removeProperty('display');
    }
    this.previousDisplay.clear();
  }
}
