import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import type { ExecutionContextKind } from '../../../shared/contracts/fingerprint-privacy';
import type { DebuggerHostPort, DebuggerLease } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';
import { cdpAudioSource, cdpBootstrapSource, PRIVACY_CDP_BINDING } from './cdp-bridge-source';
import { parsePrivacyStorageKey, type PrivacyStorageScope } from './storage-key';
import type { FramePrivacyPolicy } from './protocol';

type ExecutionContext = { id: number; origin: string; auxData?: { frameId?: string; isDefault?: boolean } };
type RuntimeOutcome = { context: ExecutionContextKind; applied: boolean; reason: string };

export class CdpPrivacyContextAdapter {
  private debugger!: DebuggerLease;
  private readonly contexts = new Map<string, ExecutionContext>();
  private readonly childKinds = new Map<string, ExecutionContextKind>();
  private readonly releases: (() => void)[] = [];
  private readonly initializing = new Set<string>();
  private rootFrameId = '';
  private scriptId?: string;
  private disposed = false;

  constructor(private readonly tab: TabSnapshot, private readonly debuggerHost: DebuggerHostPort,
    private readonly policy: (scope: PrivacyStorageScope) => FramePrivacyPolicy,
    private readonly outcome: (result: RuntimeOutcome) => void) {
  }

  async start(): Promise<void> {
    this.debugger = await this.debuggerHost.acquire(this.tab.id, 'fingerprint-privacy');
    const version = await this.debugger.send<{ protocolVersion: string; product: string }>('Browser.getVersion');
    if (version.protocolVersion !== '1.3' || !/150\.0\.7871\./.test(version.product)) {
      throw new BrowserError('UNAVAILABLE', '指纹CDP映射仅针对Electron43.7.5的Chromium150.0.7871版本，当前版本需重新取证');
    }
    this.releases.push(this.debugger.onMessage((method, parameters, sessionId) => {
      void this.message(method, parameters, sessionId).catch(error => {
        this.outcome({ context: sessionId ? this.childKinds.get(sessionId) ?? 'dedicated-worker' : 'iframe', applied: false, reason: error instanceof Error ? error.message : '运行时映射失败' });
      });
    }));
    await this.debugger.send('Page.enable');
    const tree = await this.debugger.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree');
    this.rootFrameId = tree.frameTree.frame.id;
    await this.debugger.send('Runtime.enable');
    await this.debugger.send('Runtime.addBinding', { name: PRIVACY_CDP_BINDING });
    const script = await this.debugger.send<{ identifier: string }>('Page.addScriptToEvaluateOnNewDocument', { source: cdpBootstrapSource() });
    this.scriptId = script.identifier;
    await this.debugger.send('Target.setAutoAttach', {
      autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
      filter: [{ type: 'worker', exclude: false }, { type: 'shared_worker', exclude: false }, { type: 'service_worker', exclude: false }, { type: 'iframe', exclude: false }, { exclude: true }],
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.debugger) return;
    this.releases.reverse().forEach(release => release());
    const resume = [...this.childKinds.keys()].map(sessionId => this.debugger.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined));
    void Promise.allSettled(resume).then(async () => {
      await this.debugger.send('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: true }).catch(() => undefined);
      if (this.scriptId) await this.debugger.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.scriptId }).catch(() => undefined);
      await this.debugger.send('Runtime.removeBinding', { name: PRIVACY_CDP_BINDING }).catch(() => undefined);
    }).finally(() => this.debugger.dispose());
    this.contexts.clear(); this.childKinds.clear();
  }

  private async message(method: string, parameters: Record<string, unknown>, sessionId?: string): Promise<void> {
    if (this.disposed) return;
    if (method === 'Inspector.detached') {
      this.outcome({ context: 'iframe', applied: false, reason: `共享调试连接已断开：${String(parameters.reason ?? 'unknown')}；子上下文适配已失效` });
      this.dispose();
    } else if (method === 'Runtime.executionContextCreated') {
      const context = parameters.context as ExecutionContext | undefined;
      if (context && Number.isInteger(context.id)) this.contexts.set(this.key(sessionId, context.id), context);
    } else if (method === 'Runtime.executionContextDestroyed') {
      this.contexts.delete(this.key(sessionId, Number(parameters.executionContextId)));
    } else if (method === 'Runtime.executionContextsCleared') {
      for (const key of this.contexts.keys()) if (key.startsWith(`${sessionId ?? 'root'}:`)) this.contexts.delete(key);
    } else if (method === 'Runtime.bindingCalled' && parameters.name === PRIVACY_CDP_BINDING) {
      const context = this.contexts.get(this.key(sessionId, Number(parameters.executionContextId)));
      if (!context?.auxData?.isDefault && !sessionId) return;
      if (!sessionId && context?.auxData?.frameId === this.rootFrameId) return;
      if (context) await this.inject(context, sessionId, sessionId ? this.childKinds.get(sessionId) ?? 'dedicated-worker' : 'iframe');
    } else if (method === 'Target.attachedToTarget') {
      const childSession = typeof parameters.sessionId === 'string' ? parameters.sessionId : undefined;
      const target = parameters.targetInfo as { type?: string } | undefined;
      if (!childSession) return;
      const kind: ExecutionContextKind = target?.type === 'service_worker' ? 'service-worker' : target?.type === 'shared_worker' ? 'shared-worker' : target?.type === 'iframe' ? 'iframe' : 'dedicated-worker';
      this.childKinds.set(childSession, kind);
      const timer = setTimeout(() => { void this.debugger.send('Runtime.runIfWaitingForDebugger', {}, childSession).catch(() => undefined); }, 5000);
      try {
        await this.debugger.send('Runtime.enable', {}, childSession);
        await this.debugger.send('Runtime.addBinding', { name: PRIVACY_CDP_BINDING }, childSession);
        await this.debugger.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, childSession);
        const scope = await this.debugger.send<{ storageKey: string }>('Storage.getStorageKey', {}, childSession);
        const parsed = parsePrivacyStorageKey(scope.storageKey);
        if (!parsed || parsed.nonce) {
          this.outcome({ context: kind, applied: false, reason: parsed?.nonce ? '真实StorageKey含nonce，尚未映射Brave FastHash，保持原API' : '目标未提供可映射的真实StorageKey' });
        } else {
          const policy = this.policy(parsed);
          const result = await this.debugger.send<{ result?: { value?: { installed?: boolean } } }>('Runtime.evaluate', {
            expression: cdpAudioSource(policy), returnByValue: true, awaitPromise: false,
          }, childSession);
          this.outcome({ context: kind, applied: Boolean(result.result?.value?.installed), reason: result.result?.value?.installed ? '已在目标恢复前接入Audio两API，未进行行为对照' : '该目标没有AudioBuffer或策略关闭；其他API算法未接入' });
        }
      } finally {
        clearTimeout(timer);
        await this.debugger.send('Runtime.runIfWaitingForDebugger', {}, childSession).catch(() => undefined);
      }
    } else if (method === 'Target.detachedFromTarget' && typeof parameters.sessionId === 'string') {
      this.childKinds.delete(parameters.sessionId);
    } else if (method === 'Page.frameNavigated' && !sessionId) {
      const frame = parameters.frame as { id?: string; parentId?: string } | undefined;
      if (frame?.id && !frame.parentId) this.rootFrameId = frame.id;
    }
  }

  private async inject(context: ExecutionContext, sessionId: string | undefined, kind: ExecutionContextKind): Promise<void> {
    const key = this.key(sessionId, context.id);
    if (this.initializing.has(key)) return;
    this.initializing.add(key);
    try {
      const scope = await this.debugger.send<{ storageKey: string }>('Storage.getStorageKey', context.auxData?.frameId ? { frameId: context.auxData.frameId } : {}, sessionId);
      const parsed = parsePrivacyStorageKey(scope.storageKey);
      if (!parsed || parsed.nonce) {
        this.outcome({ context: kind, applied: false, reason: parsed?.nonce ? 'StorageKey nonce已识别，FastHash尚未映射，不注入错误token' : '无法映射真实StorageKey' });
        return;
      }
      const result = await this.debugger.send<{ result?: { value?: { installed?: boolean } } }>('Runtime.evaluate', {
        contextId: context.id, expression: cdpAudioSource(this.policy(parsed)), returnByValue: true,
      }, sessionId);
      this.outcome({ context: kind, applied: Boolean(result.result?.value?.installed), reason: '基于真实StorageKey接入Audio两API，binding往返异步，首脚本读取时序尚未证明' });
    } finally { this.initializing.delete(key); }
  }
  private key(sessionId: string | undefined, contextId: number): string { return `${sessionId ?? 'root'}:${contextId}`; }
}
