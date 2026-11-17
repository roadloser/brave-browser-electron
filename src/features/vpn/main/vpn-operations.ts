import { BrowserError } from '../../../shared/errors';
import type { VpnState } from '../../../shared/contracts/vpn';
import type { VpnStateStore } from './vpn-state';

type Operation = { profileId: string; controller: AbortController; promise: Promise<VpnState> };
export class VpnOperations {
  private current?: Operation;
  private disposed = false;
  constructor(private readonly states: VpnStateStore) {}
  busy(): boolean { return !!this.current; }
  run(profileId: string, phase: VpnState['phase'], summary: string, operation: (signal: AbortSignal) => Promise<void>): Promise<VpnState> {
    if (this.disposed) return Promise.reject(new BrowserError('UNAVAILABLE', 'VPN服务正在退出'));
    if (this.current) return Promise.reject(new BrowserError('CONFLICT', '系统VPN正由另一个操作处理，请等待或取消'));
    const controller = new AbortController();
    this.states.patch(profileId, { phase, summary, error: undefined });
    const promise = Promise.resolve().then(() => operation(controller.signal)).then(() => this.states.get(profileId)).catch(error => {
      const cancelled = controller.signal.aborted && !(error instanceof AggregateError);
      const message = cancelled ? 'VPN操作已取消；已签发的服务凭据不会因此自动撤销' : error instanceof Error ? error.message : 'VPN操作失败';
      this.states.patch(profileId, { phase: 'failed', summary: message, error: message });
      throw cancelled ? new BrowserError('CANCELLED', message) : error;
    }).finally(() => { if (this.current?.promise === promise) this.current = undefined; });
    this.current = { profileId, controller, promise };
    return promise;
  }
  async cancel(profileId: string): Promise<void> {
    const operation = this.current;
    if (!operation) return;
    if (operation.profileId !== profileId) throw new BrowserError('FORBIDDEN', '不能取消其他资料发起的VPN操作');
    operation.controller.abort();
    await operation.promise.catch(() => undefined);
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.current?.controller.abort();
    await this.current?.promise.catch(() => undefined);
  }
}
