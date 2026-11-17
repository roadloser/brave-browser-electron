import { BrowserError } from '../../../../shared/errors';
import type { DebuggerLease } from '../../../../shared/runtime-ports';
import type { UserAgentPolicy, UserAgentPort } from '../../../../shared/user-agent-port';
import { braveUserAgent } from './brave-user-agent';
import { NativeUserAgentSource } from './native-user-agent';

export class UserAgentHost implements UserAgentPort {
  private readonly native = new NativeUserAgentSource();
  private disposed = false;

  async apply(lease: DebuggerLease, policy: UserAgentPolicy, sessionId?: string): Promise<void> {
    if (this.disposed) throw new BrowserError('UNAVAILABLE', 'UA映射能力已释放');
    if (policy.brand !== 'Brave' && policy.brand !== 'Google Chrome') throw new BrowserError('INVALID_ARGUMENT', 'UA品牌策略不受支持');
    const snapshot = await this.native.get();
    if (this.disposed) throw new BrowserError('CANCELLED', 'UA映射已取消');
    const override = braveUserAgent(snapshot, policy.brand);
    try { await lease.send('Emulation.setUserAgentOverride', override, sessionId); }
    catch (error) {
      try { await this.clear(lease, sessionId); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'UA映射失败且原生状态恢复未完成'); }
      throw error;
    }
  }

  async clear(lease: DebuggerLease, sessionId?: string): Promise<void> {
    await lease.send('Emulation.setUserAgentOverride', { userAgent: '' }, sessionId);
  }

  dispose(): void {
    this.disposed = true;
    this.native.dispose();
  }
}
