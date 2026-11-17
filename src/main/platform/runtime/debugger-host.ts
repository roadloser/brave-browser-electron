import type { WebContents } from 'electron';
import type { BrowserCorePort, DebuggerHostPort, DebuggerLease, DebuggerOwner } from '../../../shared/runtime-ports';
import { BrowserError } from '../../../shared/errors';

type MessageListener = (method: string, parameters: Record<string, unknown>, sessionId?: string) => void;
type LeaseState = { owner: DebuggerOwner; listeners: Set<MessageListener>; released: boolean };
type DebuggerEntry = {
  contents: WebContents; leases: Set<LeaseState>; active: boolean;
  pausedSessions: Set<string>;
  message: (event: Electron.Event, method: string, parameters: Record<string, unknown>, sessionId?: string) => void;
  detach: (event: Electron.Event, reason: string) => void;
};
const captureCommands = new Set(['Browser.getVersion', 'Page.getLayoutMetrics', 'Page.captureScreenshot']);
const privacyCommands = new Set([
  'Browser.getVersion', 'Page.enable', 'Page.getFrameTree', 'Page.addScriptToEvaluateOnNewDocument',
  'Page.removeScriptToEvaluateOnNewDocument', 'Runtime.enable', 'Runtime.addBinding',
  'Runtime.removeBinding', 'Runtime.evaluate', 'Runtime.runIfWaitingForDebugger',
  'Target.setAutoAttach', 'Target.getTargets', 'Target.attachToTarget', 'Target.detachFromTarget',
  'Storage.getStorageKey', 'Storage.getStorageKeyForFrame',
  'Debugger.enable', 'Debugger.disable', 'Debugger.evaluateOnCallFrame', 'Debugger.resume',
]);

export class DebuggerHost implements DebuggerHostPort {
  private readonly entries = new Map<string, DebuggerEntry>();
  constructor(private readonly core: BrowserCorePort) {}

  async acquire(tabId: string, owner: DebuggerOwner): Promise<DebuggerLease> {
    let entry = this.entries.get(tabId);
    if (!entry?.active) {
      const contents = this.core.getTabWebContents(tabId);
      if (contents.debugger.isAttached()) throw new BrowserError('CONFLICT', '此页面调试器正被开发者工具或其他能力使用');
      contents.debugger.attach('1.3');
      const created: DebuggerEntry = {
        contents, leases: new Set(), active: true, pausedSessions: new Set(),
        message: (_event, method, parameters, sessionId) => {
          if (method === 'Debugger.paused') created.pausedSessions.add(sessionId ?? '');
          if (method === 'Debugger.resumed') created.pausedSessions.delete(sessionId ?? '');
          if (method === 'Target.detachedFromTarget' && typeof parameters.sessionId === 'string') created.pausedSessions.delete(parameters.sessionId);
          for (const lease of created.leases) for (const listener of lease.listeners) {
            try { listener(method, parameters, sessionId); } catch { continue; }
          }
        },
        detach: (_event, reason) => {
          created.active = false;
          this.entries.delete(tabId);
          if (!contents.isDestroyed()) {
            contents.debugger.removeListener('message', created.message);
            contents.debugger.removeListener('detach', created.detach);
          }
          for (const lease of created.leases) for (const listener of lease.listeners) {
            try { listener('Inspector.detached', { reason }); } catch { continue; }
          }
        },
      };
      contents.debugger.on('message', created.message);
      contents.debugger.on('detach', created.detach);
      contents.once('destroyed', () => { created.active = false; this.entries.delete(tabId); });
      this.entries.set(tabId, created);
      entry = created;
    }
    const current = entry;
    if ([...current.leases].some(lease => !lease.released && lease.owner === owner)) throw new BrowserError('CONFLICT', '此页面已存在同一能力的调试器租约');
    const lease: LeaseState = { owner, listeners: new Set(), released: false };
    current.leases.add(lease);
    const assertActive = () => {
      if (lease.released || !current.active || current.contents.isDestroyed() || !current.contents.debugger.isAttached()) {
        throw new BrowserError('UNAVAILABLE', '页面调试器租约已失效，请重新取得能力');
      }
    };
    return {
      send<Result>(method: string, parameters?: Record<string, unknown>, sessionId?: string): Promise<Result> {
        assertActive();
        const allowed = owner === 'page-capture' ? captureCommands : privacyCommands;
        if (!allowed.has(method) || (owner === 'page-capture' && sessionId)) throw new BrowserError('FORBIDDEN', '此调试器租约不能执行该命令');
        return current.contents.debugger.sendCommand(method, parameters, sessionId) as Promise<Result>;
      },
      onMessage(listener: MessageListener) {
        assertActive(); lease.listeners.add(listener);
        return () => { lease.listeners.delete(listener); };
      },
      dispose: () => {
        if (lease.released) return;
        lease.released = true; lease.listeners.clear(); current.leases.delete(lease);
        if (owner === 'fingerprint-privacy' && current.active && !current.contents.isDestroyed()) {
          const resumes = [...current.pausedSessions].map(sessionId => current.contents.debugger.sendCommand('Debugger.resume', {}, sessionId || undefined).catch(() => undefined));
          current.pausedSessions.clear();
          void Promise.allSettled(resumes).finally(() => {
            if (current.active && !current.contents.isDestroyed() && current.leases.size && ![...current.leases].some(activeLease => activeLease.owner === 'fingerprint-privacy' && !activeLease.released)) {
              void current.contents.debugger.sendCommand('Debugger.disable').catch(() => undefined);
            }
            if (!current.leases.size) this.release(tabId, current);
          });
        } else if (!current.leases.size) this.release(tabId, current);
      },
    };
  }

  dispose(): void {
    for (const [tabId, entry] of [...this.entries]) {
      for (const lease of entry.leases) { lease.released = true; lease.listeners.clear(); }
      entry.leases.clear(); this.release(tabId, entry);
    }
  }
  private release(tabId: string, entry: DebuggerEntry): void {
    if (this.entries.get(tabId) === entry) this.entries.delete(tabId);
    if (!entry.contents.isDestroyed()) {
      entry.contents.debugger.removeListener('message', entry.message);
      entry.contents.debugger.removeListener('detach', entry.detach);
      if (entry.active && entry.contents.debugger.isAttached()) entry.contents.debugger.detach();
    }
    entry.active = false;
  }
}
