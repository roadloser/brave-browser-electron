import type { Session } from 'electron';
import { BrowserError } from '../../../shared/errors';

export type RequestStrategy = 'native-shields' | 'extension-network';
export type RequestPolicyState = {
  strategy: RequestStrategy | null;
  decisionId: string | null;
  nativeRegistered: boolean;
  extensionNetworkAvailable: boolean;
};

export class NetworkPolicyCoordinator {
  private readonly policies = new WeakMap<Session, RequestPolicyState>();

  get(browserSession: Session): RequestPolicyState {
    return { ...(this.policies.get(browserSession) ?? {
      strategy: null, decisionId: null, nativeRegistered: false, extensionNetworkAvailable: false,
    }) };
  }

  select(browserSession: Session, strategy: RequestStrategy, decisionId: string): void {
    if (!decisionId.trim()) throw new BrowserError('INVALID_ARGUMENT', '请求策略必须关联批准的决策');
    const current = this.get(browserSession);
    if (current.strategy && current.strategy !== strategy) {
      throw new BrowserError('CONFLICT', '会话请求策略不能运行中切换；需关闭当前会话后重新创建');
    }
    this.policies.set(browserSession, {
      strategy, decisionId, nativeRegistered: current.nativeRegistered,
      extensionNetworkAvailable: strategy === 'extension-network',
    });
  }

  claimNative(browserSession: Session): () => void {
    const current = this.get(browserSession);
    if (current.strategy !== 'native-shields') throw new BrowserError('CONFLICT', '尚未批准此会话使用原生 Shields 请求路线');
    if (current.nativeRegistered) throw new BrowserError('CONFLICT', '此会话已经注册原生请求处理');
    this.policies.set(browserSession, { ...current, nativeRegistered: true, extensionNetworkAvailable: false });
    return () => this.policies.set(browserSession, { ...current, nativeRegistered: false });
  }

  requireExtensionNetwork(browserSession: Session): void {
    const current = this.get(browserSession);
    if (current.strategy !== 'extension-network' || current.nativeRegistered) {
      throw new BrowserError('CONFLICT', '扩展网络路线未获批准或已被原生监听占用');
    }
  }
}
