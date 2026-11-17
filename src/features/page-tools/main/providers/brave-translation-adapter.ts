import type { Session } from 'electron';
import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { PageTarget } from '../../../../shared/runtime-ports';
import { BrowserError } from '../../../../shared/errors';
import type { TranslationAdapterPort, TranslationRuntimeState } from './provider';
import { TranslationResource } from '../translation-resource';
import { translationRuntimeSource } from '../../page/translation-runtime';

export class BraveTranslationAdapter implements TranslationAdapterPort {
  readonly capability = {
    implementation: 'brave-translate-element', version: 'static-v1/chromium-150.0.7871.250',
    scope: 'main-frame' as const, limitations: ['需要合法 Brave 服务凭据', '子框架隔离执行尚未覆盖'],
  };
  private readonly resources = new TranslationResource();
  private readonly sessions = new Map<Session, string>();
  private readonly releases: Array<() => void>;
  constructor(private readonly runtime: FeatureRuntime) {
    this.releases = [
      runtime.pages.register('page-tools.translation.runtime', { world: 'translation', source: translationRuntimeSource }),
      runtime.core.onEvent((event) => { if (event.type === 'sessionCreated') this.registerSession(event.context); }),
    ];
    for (const context of runtime.core.getContexts()) this.registerSession(context);
  }
  available() {
    return process.env.BRAVE_TRANSLATE_SERVICE_KEY?.trim() ?
      { available: true } : { available: false, reason: '官方翻译需要授权的 Brave 服务凭据，当前未配置' };
  }
  async start(target: PageTarget, language: string, signal: AbortSignal) {
    const serviceKey = process.env.BRAVE_TRANSLATE_SERVICE_KEY?.trim();
    if (!serviceKey) throw new BrowserError('FORBIDDEN', this.available().reason!, true, { capability: 'official-translation-credentials' });
    const tab = this.runtime.core.getTab(target.tabId);
    const script = await this.resources.get(this.runtime.core.sessionForContext(tab), signal);
    if (signal.aborted) throw new BrowserError('CANCELLED', '翻译请求已取消');
    return this.runtime.pages.execute<TranslationRuntimeState>('page-tools.translation.runtime', target, {
      action: 'start', script, apiKey: serviceKey, targetLanguage: language,
    });
  }
  state(target: PageTarget) {
    return this.runtime.pages.execute<TranslationRuntimeState | null>('page-tools.translation.runtime', target, { action: 'status' });
  }
  async restore(target: PageTarget, cancel: boolean) {
    await this.runtime.pages.execute('page-tools.translation.runtime', target, { action: cancel ? 'cancel' : 'undo' });
  }
  dispose() {
    this.releases.forEach((release) => release());
    for (const [browserSession, registration] of this.sessions) browserSession.unregisterPreloadScript(registration);
    this.sessions.clear(); this.resources.clear();
  }
  private registerSession(context: BrowserContext) {
    const browserSession = this.runtime.core.sessionForContext(context);
    if (this.sessions.has(browserSession)) return;
    this.sessions.set(browserSession, browserSession.registerPreloadScript({
      type: 'frame', filePath: this.runtime.assets.translationPreloadPath,
    }));
  }
}
