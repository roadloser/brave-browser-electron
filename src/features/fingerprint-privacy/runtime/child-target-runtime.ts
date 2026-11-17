import type { ExecutionContextKind } from '../../../shared/contracts/fingerprint-privacy';
import type { DebuggerLease } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';
import { parsePrivacyStorageKey } from './storage-key';
import { resolvePolicyScope, type PrivacyPolicyScope } from './policy-scope';
import { cdpWorldSource } from './cdp-bridge-source';
import { RuntimeDeadline, assertRuntimeActive } from './runtime-deadline';
import type { WorldInstallResult, WorldPrivacyPolicy } from './world-types';
import type { RuntimeOutcome } from './runtime-outcome';
import type { NativeUserAgentController } from './native-user-agent-controller';

type ChildRuntimeOptions = {
  lease: DebuggerLease;
  userAgent: NativeUserAgentController;
  source: string;
  bootstrapSource: () => string;
  rootOrigin: () => string;
  disposed: () => boolean;
  policy: (scope: PrivacyPolicyScope, kind: ExecutionContextKind) => WorldPrivacyPolicy;
  register: (identity: string, objectId: string | undefined, sessionId: string) => Promise<WorldInstallResult>;
  record: (identity: string, outcome: Omit<RuntimeOutcome, 'identity'>) => void;
};

export class ChildTargetRuntime {
  readonly kinds = new Map<string, ExecutionContextKind>();
  private readonly frameScripts = new Map<string, string>();
  constructor(private readonly options: ChildRuntimeOptions) {}

  async attached(parameters: Record<string, unknown>): Promise<void> {
    const sessionId = typeof parameters.sessionId === 'string' ? parameters.sessionId : undefined;
    const target = parameters.targetInfo as { type?: string } | undefined;
    if (!sessionId) return;
    const kind: ExecutionContextKind = target?.type === 'service_worker' ? 'service-worker'
      : target?.type === 'shared_worker' ? 'shared-worker' : target?.type === 'iframe' ? 'iframe'
        : target?.type === 'worklet' ? 'worklet' : 'dedicated-worker';
    this.kinds.set(sessionId, kind);
    const deadline = new RuntimeDeadline(5000, () => {
      void this.options.lease.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined);
      this.options.record(`${sessionId}:target`, { context: kind, applied: false, firstRead: 'failed', reason: '子目标初始化超过5秒，已恢复；不能声称首读受保护' });
    });
    try {
      if (kind !== 'worklet') await this.options.userAgent.apply(sessionId);
      this.assert(deadline);
      await this.options.lease.send('Runtime.enable', {}, sessionId);
      await this.options.lease.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);
      this.assert(deadline);
      if (kind === 'iframe') {
        await this.options.lease.send('Debugger.enable', {}, sessionId);
        await this.options.lease.send('Page.enable', {}, sessionId);
        const script = await this.options.lease.send<{ identifier: string }>('Page.addScriptToEvaluateOnNewDocument', { source: this.options.bootstrapSource() }, sessionId);
        this.frameScripts.set(sessionId, script.identifier);
        this.assert(deadline);
        return;
      }
      const scope = await this.scope(kind, sessionId);
      this.assert(deadline);
      const policy = this.options.policy(scope, kind);
      const result = await this.options.lease.send<{ result?: { objectId?: string } }>('Runtime.evaluate', {
        expression: cdpWorldSource(this.options.source, policy), returnByValue: false, awaitPromise: false,
      }, sessionId);
      this.assert(deadline);
      const installed = await this.options.register(`${sessionId}:target`, result.result?.objectId, sessionId);
      this.assert(deadline);
      this.options.record(`${sessionId}:target`, {
        context: kind, applied: installed.installed, coveredApis: installed.coveredApis,
        failures: installed.failures, firstRead: 'prepared',
        reason: kind === 'worklet'
          ? 'threaded Worklet继承真实top-frame策略且不加nonce；仅暴露API安装，尚未运行对照'
          : '子目标恢复前安装固定算法与原生UA；命令接入不代表行为对照已通过',
      });
    } finally {
      deadline.dispose();
      await this.options.lease.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined);
    }
  }

  detached(sessionId: string): void { this.kinds.delete(sessionId); this.frameScripts.delete(sessionId); this.options.userAgent.forget(sessionId); }
  async resumeAll(): Promise<void> {
    await Promise.allSettled([...this.kinds.keys()].map(sessionId => this.options.lease.send('Runtime.runIfWaitingForDebugger', {}, sessionId)));
  }
  async removeFrameScripts(): Promise<void> {
    await Promise.allSettled([...this.frameScripts].map(async ([sessionId, identifier]) => {
      await this.options.lease.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }, sessionId);
      await this.options.lease.send('Debugger.disable', {}, sessionId);
    }));
    this.frameScripts.clear();
  }
  clear(): void { this.kinds.clear(); }

  private async scope(kind: ExecutionContextKind, sessionId: string): Promise<PrivacyPolicyScope> {
    const root = this.options.rootOrigin();
    if (kind === 'worklet') {
      if (!root) throw new BrowserError('UNAVAILABLE', 'Worklet缺少创建者真实top-frame来源，不以module URL代替');
      return resolvePolicyScope({ origin: root, topLevelSite: root, nonce: null }, kind, root);
    }
    const result = await this.options.lease.send<{ storageKey: string }>('Storage.getStorageKey', {}, sessionId);
    const scope = parsePrivacyStorageKey(result.storageKey);
    if (!scope) throw new BrowserError('UNAVAILABLE', '子目标未提供可映射的真实StorageKey');
    return resolvePolicyScope(scope, kind, root);
  }
  private assert(deadline: RuntimeDeadline): void { assertRuntimeActive(deadline.signal, this.options.disposed()); }
}
