import type { Session } from 'electron';
import type { BrowserContext, WindowSnapshot } from '../../shared/contracts/browser-core';
import { BrowserError } from '../../shared/errors';
import type { SessionRegistry } from './session-registry';
import type { WindowManager } from './window-manager';
import type { WindowRecord } from './core-state';
import type { PageEventSource } from './page-event-source';

export class TorWindowController {
  constructor(
    private readonly sessions: SessionRegistry, private readonly windows: WindowManager,
    private readonly events: PageEventSource,
    private readonly initialize: (window: WindowRecord) => Promise<WindowSnapshot>,
    private readonly prepareProfile: (profileId: string) => void,
  ) {}
  async open(profileId: string, prepare: (context: BrowserContext, session: Session) => Promise<void>): Promise<WindowSnapshot> {
    this.prepareProfile(profileId);
    const context = this.sessions.acquire(profileId, true, 'tor');
    let window: WindowRecord | undefined;
    try {
      await prepare(context, this.sessions.get(context));
      window = await this.windows.create(context);
      return await this.initialize(window);
    } catch (error) {
      if (window && !window.native.isDestroyed()) window.native.destroy();
      else await this.sessions.release(context);
      throw error;
    }
  }
  async closeContext(contextId: string): Promise<void> {
    const context = this.sessions.contexts().find(candidate => candidate.contextId === contextId);
    if (!context) return;
    if (context.kind !== 'tor') throw new BrowserError('FORBIDDEN', '此操作只允许关闭 Tor 上下文');
    const targets = [...this.windows.records.values()].filter(window => window.context.contextId === contextId);
    if (!targets.length) return;
    await new Promise<void>((resolve, reject) => {
      const release = this.events.subscribe(event => {
        if (event.type === 'contextDisposed' && event.context.contextId === contextId) { clearTimeout(timeout); release(); resolve(); }
      });
      const timeout = setTimeout(() => { release(); reject(new BrowserError('UNAVAILABLE', 'Tor 会话清理未在预期时间完成')); }, 15000);
      for (const window of targets) if (!window.native.isDestroyed()) window.native.destroy();
    });
  }
}
