import { randomUUID } from 'node:crypto';
import type { DebuggerLease } from '../../../shared/runtime-ports';

type PausedFrame = { callFrameId: string; location: { scriptId: string } };
type ParsedScript = { scriptId: string; executionContextId: number; url: string };

export class BootstrapPauseController {
  readonly sourceUrl = `brave-privacy-bootstrap://${randomUUID()}/initial.js`;
  private readonly scripts = new Map<string, number>();
  private readonly paused = new Map<string, ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(private readonly lease: DebuggerLease,
    private readonly install: (contextId: number, callFrameId: string, sessionId?: string) => Promise<void>,
    private readonly failure: (error: unknown) => void) {}

  source(): string { return `(() => { debugger; })();\n//# sourceURL=${this.sourceUrl}`; }

  parsed(parameters: Record<string, unknown>, sessionId?: string): void {
    const script = parameters as unknown as ParsedScript;
    if (script.url !== this.sourceUrl || typeof script.scriptId !== 'string' || !Number.isInteger(script.executionContextId)) return;
    this.scripts.set(this.key(sessionId, script.scriptId), script.executionContextId);
  }

  async pause(parameters: Record<string, unknown>, sessionId?: string): Promise<void> {
    const frames = parameters.callFrames as PausedFrame[] | undefined;
    const frame = frames?.[0];
    const contextId = frame ? this.scripts.get(this.key(sessionId, frame.location.scriptId)) : undefined;
    const identity = sessionId ?? 'root';
    const previous = this.paused.get(identity);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.paused.delete(identity);
      void this.lease.send('Debugger.resume', {}, sessionId).catch(() => undefined);
      this.failure(new Error('指纹首读准备超过5秒，已恢复页面并标记覆盖失败'));
    }, 5000);
    this.paused.set(identity, timer);
    try {
      if (!this.disposed && frame && contextId !== undefined) await this.install(contextId, frame.callFrameId, sessionId);
    } catch (error) { this.failure(error); }
    finally {
      clearTimeout(timer); this.paused.delete(identity);
      await this.lease.send('Debugger.resume', {}, sessionId).catch(() => undefined);
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const sessions = [...this.paused.keys()];
    for (const timer of this.paused.values()) clearTimeout(timer);
    this.paused.clear(); this.scripts.clear();
    await Promise.allSettled(sessions.map(session => this.lease.send('Debugger.resume', {}, session === 'root' ? undefined : session)));
  }

  private key(sessionId: string | undefined, scriptId: string): string { return `${sessionId ?? 'root'}:${scriptId}`; }
}
