import type { DebuggerLease } from '../../../shared/runtime-ports';
import type { UserAgentPort } from '../../../shared/user-agent-port';

export class NativeUserAgentController {
  private readonly sessions = new Set<string>();
  constructor(private readonly provider: UserAgentPort, private readonly lease: DebuggerLease) {}

  async apply(sessionId?: string): Promise<void> {
    await this.provider.apply(this.lease, { brand: 'Brave' }, sessionId);
    this.sessions.add(sessionId ?? 'root');
  }

  forget(sessionId: string): void { this.sessions.delete(sessionId); }

  async dispose(): Promise<void> {
    const sessions = [...this.sessions];
    this.sessions.clear();
    const results = await Promise.allSettled(sessions.map(sessionId => this.provider.clear(this.lease, sessionId === 'root' ? undefined : sessionId)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), '部分原生UA目标恢复失败，连接销毁后释放');
  }
}
