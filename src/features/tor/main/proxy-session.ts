import type { Session } from 'electron';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import { BrowserError } from '../../../shared/errors';

export class TorProxySession {
  private context?: BrowserContext;
  private browserSession?: Session;
  async prepare(context: BrowserContext, browserSession: Session, port: number): Promise<void> {
    if (context.kind !== 'tor' || !context.isPrivate || !Number.isInteger(port) || port < 1 || port > 65535) throw new BrowserError('FORBIDDEN', 'Tor 代理需要独立私密上下文与有效本地端口');
    this.context = context; this.browserSession = browserSession;
    browserSession.enableNetworkEmulation({ offline: true });
    await browserSession.closeAllConnections();
    await browserSession.setProxy({ mode: 'fixed_servers', proxyRules: 'socks5://127.0.0.1:' + port, proxyBypassRules: '<-loopback>' });
  }
  contextId(): string | null { return this.context?.contextId ?? null; }
  connected(): void {
    if (!this.browserSession) throw new BrowserError('UNAVAILABLE', 'Tor 代理会话尚未配置');
    this.browserSession.enableNetworkEmulation({ offline: false });
  }
  async block(): Promise<void> {
    if (!this.browserSession) return;
    this.browserSession.enableNetworkEmulation({ offline: true });
    await this.browserSession.closeAllConnections();
  }
  release(): void { this.context = undefined; this.browserSession = undefined; }
}
