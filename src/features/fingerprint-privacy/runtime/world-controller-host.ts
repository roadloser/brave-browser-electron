import type { DebuggerLease } from '../../../shared/runtime-ports';
import type { WorldInstallResult } from './world-types';

type RemoteController = { objectId: string; sessionId?: string; contextId?: number };

export class WorldControllerHost {
  private readonly controllers = new Map<string, RemoteController>();
  constructor(private readonly lease: DebuggerLease) {}

  async register(identity: string, objectId: string, sessionId?: string, contextId?: number): Promise<WorldInstallResult> {
    this.release(identity);
    this.controllers.set(identity, { objectId, sessionId, contextId });
    const result = await this.lease.send<{ result?: { value?: WorldInstallResult }; exceptionDetails?: unknown }>('Runtime.callFunctionOn', {
      objectId, functionDeclaration: 'function(){return this.report()}', returnByValue: true,
    }, sessionId);
    if (result.exceptionDetails || !result.result?.value) throw new Error('指纹运行时控制器未返回安装状态');
    return result.result.value;
  }

  async updateZoom(factor: number): Promise<void> {
    if (!Number.isFinite(factor) || factor <= 0 || factor > 10) throw new Error('指纹缩放因子无效');
    const results = await Promise.allSettled([...this.controllers.values()].map(async controller => {
      const result = await this.lease.send<{ exceptionDetails?: unknown }>('Runtime.callFunctionOn', {
      objectId: controller.objectId, functionDeclaration: 'function(factor){this.updateZoom(factor)}',
      arguments: [{ value: factor }], returnByValue: true,
      }, controller.sessionId);
      if (result.exceptionDetails) throw new Error('目标上下文拒绝缩放更新');
    }));
    if (results.some(result => result.status === 'rejected')) throw new Error('部分执行上下文未能更新缩放策略，等待下一次导航重新安装');
  }

  releaseContext(contextId: number, sessionId?: string): void {
    for (const [identity, controller] of this.controllers) if (controller.contextId === contextId && controller.sessionId === sessionId) this.release(identity);
  }
  releaseSession(sessionId?: string): void {
    for (const [identity, controller] of this.controllers) if (controller.sessionId === sessionId) this.release(identity);
  }
  dispose(): void { for (const identity of this.controllers.keys()) this.release(identity); }
  private release(identity: string): void {
    const controller = this.controllers.get(identity);
    if (!controller) return;
    this.controllers.delete(identity);
    void this.lease.send('Runtime.releaseObject', { objectId: controller.objectId }, controller.sessionId).catch(() => undefined);
  }
}
