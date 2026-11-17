import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import type { ExecutionContextKind } from '../../../shared/contracts/fingerprint-privacy';
import type { DebuggerHostPort, DebuggerLease } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';
import { cdpWorldSource } from './cdp-bridge-source';
import { BootstrapPauseController } from './bootstrap-pause-controller';
import { parsePrivacyStorageKey, type PrivacyStorageScope } from './storage-key';
import type { WorldInstallResult, WorldPrivacyPolicy } from './world-types';

type ExecutionContext = { id: number; origin: string; auxData?: { frameId?: string; isDefault?: boolean; type?: string } };
type RuntimeOutcome = { context: ExecutionContextKind; applied: boolean; reason: string; coveredApis?: string[]; failures?: string[]; firstRead?: 'prepared' | 'unknown' | 'failed' };

export class CdpPrivacyContextAdapter {
  private debugger!: DebuggerLease;
  private readonly contexts = new Map<string, ExecutionContext>();
  private readonly childKinds = new Map<string, ExecutionContextKind>();
  private readonly releases: (() => void)[] = [];
  private readonly initializing = new Set<string>();
  private rootFrameId = '';
  private rootOrigin = '';
  private scriptId?: string;
  private disposed = false;
  private pauses?: BootstrapPauseController;

  constructor(private readonly tab: TabSnapshot, private readonly debuggerHost: DebuggerHostPort,
    private readonly policy: (scope: PrivacyStorageScope, kind: ExecutionContextKind) => WorldPrivacyPolicy,
    private readonly worldSource: string,
    private readonly outcome: (result: RuntimeOutcome) => void) {
  }

  async start(): Promise<void> {
    this.debugger = await this.debuggerHost.acquire(this.tab.id, 'fingerprint-privacy');
    const version = await this.debugger.send<{ protocolVersion: string; product: string }>('Browser.getVersion');
    if (version.protocolVersion !== '1.3' || !/150\.0\.7871\./.test(version.product)) {
      throw new BrowserError('UNAVAILABLE', '指纹CDP映射仅针对Electron43.7.5的Chromium150.0.7871版本，当前版本需重新取证');
    }
    this.pauses = new BootstrapPauseController(this.debugger,
      (contextId, callFrameId, sessionId) => this.injectPaused(contextId, callFrameId, sessionId),
      error => this.outcome({ context: 'iframe', applied: false, reason: error instanceof Error ? error.message : '首读屏障失败' }));
    this.releases.push(this.debugger.onMessage((method, parameters, sessionId) => {
      void this.message(method, parameters, sessionId).catch(error => {
        this.outcome({ context: sessionId ? this.childKinds.get(sessionId) ?? 'dedicated-worker' : 'iframe', applied: false, reason: error instanceof Error ? error.message : '运行时映射失败' });
      });
    }));
    await this.debugger.send('Page.enable');
    const tree = await this.debugger.send<{ frameTree: { frame: { id: string; url: string; securityOrigin?: string } } }>('Page.getFrameTree');
    this.rootFrameId = tree.frameTree.frame.id;
    this.updateRootOrigin(tree.frameTree.frame.url, tree.frameTree.frame.securityOrigin);
    await this.debugger.send('Runtime.enable');
    await this.debugger.send('Debugger.enable');
    const script = await this.debugger.send<{ identifier: string }>('Page.addScriptToEvaluateOnNewDocument', { source: this.pauses.source() });
    this.scriptId = script.identifier;
    await this.debugger.send('Target.setAutoAttach', {
      autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
      filter: [{ type: 'worker', exclude: false }, { type: 'shared_worker', exclude: false }, { type: 'service_worker', exclude: false }, { type: 'iframe', exclude: false }, { type: 'worklet', exclude: false }, { exclude: true }],
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.debugger) return;
    this.releases.reverse().forEach(release => release());
    const resume = [...this.childKinds.keys()].map(sessionId => this.debugger.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined));
    void Promise.allSettled(resume).then(async () => {
      await this.pauses?.dispose();
      await this.debugger.send('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: true }).catch(() => undefined);
      if (this.scriptId) await this.debugger.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.scriptId }).catch(() => undefined);
      await this.debugger.send('Debugger.disable').catch(() => undefined);
    }).finally(() => this.debugger.dispose());
    this.contexts.clear(); this.childKinds.clear();
  }

  private async message(method: string, parameters: Record<string, unknown>, sessionId?: string): Promise<void> {
    if (this.disposed) return;
    if (method === 'Inspector.detached') {
      this.outcome({ context: 'iframe', applied: false, reason: `共享调试连接已断开：${String(parameters.reason ?? 'unknown')}；子上下文适配已失效` });
      this.dispose();
    } else if (method === 'Debugger.scriptParsed') {
      this.pauses?.parsed(parameters, sessionId);
    } else if (method === 'Debugger.paused') {
      await this.pauses?.pause(parameters, sessionId);
    } else if (method === 'Runtime.executionContextCreated') {
      const context = parameters.context as ExecutionContext | undefined;
      if (context && Number.isInteger(context.id)) {
        this.contexts.set(this.key(sessionId, context.id), context);
        if (!sessionId && context.auxData?.type === 'worker' && context.auxData.frameId) {
          await this.inject(context, undefined, 'worklet');
        }
      }
    } else if (method === 'Runtime.executionContextDestroyed') {
      this.contexts.delete(this.key(sessionId, Number(parameters.executionContextId)));
    } else if (method === 'Runtime.executionContextsCleared') {
      for (const key of this.contexts.keys()) if (key.startsWith(`${sessionId ?? 'root'}:`)) this.contexts.delete(key);
    } else if (method === 'Target.attachedToTarget') {
      const childSession = typeof parameters.sessionId === 'string' ? parameters.sessionId : undefined;
      const target = parameters.targetInfo as { type?: string } | undefined;
      if (!childSession) return;
      const kind: ExecutionContextKind = target?.type === 'service_worker' ? 'service-worker' : target?.type === 'shared_worker' ? 'shared-worker' : target?.type === 'iframe' ? 'iframe' : target?.type === 'worklet' ? 'worklet' : 'dedicated-worker';
      this.childKinds.set(childSession, kind);
      const timer = setTimeout(() => { void this.debugger.send('Runtime.runIfWaitingForDebugger', {}, childSession).catch(() => undefined); }, 5000);
      try {
        await this.debugger.send('Runtime.enable', {}, childSession);
        await this.debugger.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, childSession);
        if (kind === 'iframe') {
          await this.debugger.send('Debugger.enable', {}, childSession);
          await this.debugger.send('Page.enable', {}, childSession);
          await this.debugger.send('Page.addScriptToEvaluateOnNewDocument', { source: this.pauses!.source() }, childSession);
          return;
        }
        if (kind === 'worklet') {
          if (!this.rootOrigin) {
            this.outcome({ context: kind, applied: false, firstRead: 'failed', reason: 'threaded Worklet未取得创建者顶层真实origin，拒绝以module URL替代' });
            return;
          }
          const policy = this.policy({ origin: this.rootOrigin, topLevelSite: this.rootOrigin, nonce: null }, kind);
          const result = await this.debugger.send<{ result?: { value?: WorldInstallResult } }>('Runtime.evaluate', {
            expression: cdpWorldSource(this.worldSource, policy), returnByValue: true,
          }, childSession);
          this.outcome({ context: kind, applied: Boolean(result.result?.value?.installed), coveredApis: result.result?.value?.coveredApis,
            failures: result.result?.value?.failures, firstRead: 'prepared',
            reason: '按Brave继承创建者top-frame策略且off-main不加nonce；仅Paint严格hit-test暴露项，未运行对照' });
          return;
        }
        const scope = await this.debugger.send<{ storageKey: string }>('Storage.getStorageKey', {}, childSession);
        const parsed = parsePrivacyStorageKey(scope.storageKey);
        if (parsed && kind !== 'iframe') parsed.nonce = null;
        if (parsed && kind === 'dedicated-worker') {
          if (!this.rootOrigin) throw new BrowserError('UNAVAILABLE', 'Dedicated Worker缺少真实创建者top-frame origin');
          parsed.origin = this.rootOrigin;
        }
        if (!parsed) {
          this.outcome({ context: kind, applied: false, reason: parsed?.nonce ? '真实StorageKey含nonce，尚未映射Brave FastHash，保持原API' : '目标未提供可映射的真实StorageKey' });
        } else {
          const policy = this.policy(parsed, kind);
          const result = await this.debugger.send<{ result?: { value?: WorldInstallResult } }>('Runtime.evaluate', {
            expression: cdpWorldSource(this.worldSource, policy), returnByValue: true, awaitPromise: false,
          }, childSession);
          const installed = result.result?.value;
          this.outcome({ context: kind, applied: Boolean(installed?.installed), coveredApis: installed?.coveredApis, failures: installed?.failures, firstRead: 'prepared',
            reason: installed?.installed ? '已在目标恢复前安装固定算法bundle，未进行行为对照' : '目标无对应API或策略关闭' });
        }
      } finally {
        clearTimeout(timer);
        await this.debugger.send('Runtime.runIfWaitingForDebugger', {}, childSession).catch(() => undefined);
      }
    } else if (method === 'Target.detachedFromTarget' && typeof parameters.sessionId === 'string') {
      this.childKinds.delete(parameters.sessionId);
    } else if (method === 'Page.frameNavigated' && !sessionId) {
      const frame = parameters.frame as { id?: string; parentId?: string; url?: string; securityOrigin?: string } | undefined;
      if (frame?.id && !frame.parentId) {
        this.rootFrameId = frame.id; this.updateRootOrigin(frame.url ?? '', frame.securityOrigin);
      }
    }
  }

  private async inject(context: ExecutionContext, sessionId: string | undefined, kind: ExecutionContextKind): Promise<void> {
    const key = this.key(sessionId, context.id);
    if (this.initializing.has(key)) return;
    this.initializing.add(key);
    try {
      const scope = await this.debugger.send<{ storageKey: string }>('Storage.getStorageKey', context.auxData?.frameId ? { frameId: context.auxData.frameId } : {}, sessionId);
      const parsed = parsePrivacyStorageKey(scope.storageKey);
      if (!parsed) {
        this.outcome({ context: kind, applied: false, reason: parsed?.nonce ? 'StorageKey nonce已识别，FastHash尚未映射，不注入错误token' : '无法映射真实StorageKey' });
        return;
      }
      const result = await this.debugger.send<{ result?: { value?: WorldInstallResult } }>('Runtime.evaluate', {
        contextId: context.id, expression: cdpWorldSource(this.worldSource, this.policy(parsed, kind)), returnByValue: true,
      }, sessionId);
      this.outcome({ context: kind, applied: Boolean(result.result?.value?.installed), coveredApis: result.result?.value?.coveredApis, failures: result.result?.value?.failures, firstRead: 'unknown',
        reason: '基于真实StorageKey安装固定算法bundle，contextCreated异步路径首脚本读取时序尚未证明' });
    } finally { this.initializing.delete(key); }
  }

  private async injectPaused(contextId: number, callFrameId: string, sessionId?: string): Promise<void> {
    const context = this.contexts.get(this.key(sessionId, contextId));
    if (!context?.auxData?.frameId || !context.auxData.isDefault) return;
    const kind: ExecutionContextKind = !sessionId && context.auxData.frameId === this.rootFrameId ? 'window' : 'iframe';
    const result = await this.debugger.send<{ storageKey: string }>('Storage.getStorageKey', { frameId: context.auxData.frameId }, sessionId);
    const scope = parsePrivacyStorageKey(result.storageKey);
    if (!scope) {
      this.outcome({ context: kind, applied: false, firstRead: 'failed', reason: scope?.nonce ? '首读暂停已取得真实nonce，FastHash尚未映射，拒绝错误token' : '首读暂停未取得合法StorageKey' });
      return;
    }
    const installed = await this.debugger.send<{ result?: { value?: WorldInstallResult } }>('Debugger.evaluateOnCallFrame', {
      callFrameId, expression: cdpWorldSource(this.worldSource, this.policy(scope, kind)), returnByValue: true, timeout: 4000,
    }, sessionId);
    this.outcome({ context: kind, applied: Boolean(installed.result?.value?.installed), coveredApis: installed.result?.value?.coveredApis,
      failures: installed.result?.value?.failures, firstRead: 'prepared',
      reason: '自身nonce bootstrap暂停内依据真实StorageKey安装固定算法bundle后恢复；首读代码链已闭合，尚未运行对照' });
  }

  private key(sessionId: string | undefined, contextId: number): string { return `${sessionId ?? 'root'}:${contextId}`; }
  private updateRootOrigin(url: string, origin?: string): void {
    try {
      const value = new URL(origin && origin !== '://' ? origin : url);
      this.rootOrigin = ['http:', 'https:'].includes(value.protocol) ? value.origin : '';
    } catch { this.rootOrigin = ''; }
  }
}
