import type { WebContents } from 'electron';
import { BrowserError } from '../../../shared/errors';

export class DebuggerSession {
  private attached = false;

  constructor(private readonly contents: WebContents, private readonly approvedDecisionId: string) {}

  async attach(): Promise<{ protocolVersion: string; product: string }> {
    if (!this.approvedDecisionId) throw new BrowserError('FORBIDDEN', '此调试器能力尚未批准');
    if (this.contents.debugger.isAttached()) throw new BrowserError('CONFLICT', '调试器已被其他能力占用');
    this.contents.debugger.attach('1.3');
    this.attached = true;
    try {
      const version = await this.contents.debugger.sendCommand('Browser.getVersion');
      return { protocolVersion: String(version.protocolVersion), product: String(version.product) };
    } catch (error) { this.dispose(); throw error; }
  }

  send<Result>(method: string, parameters?: Record<string, unknown>): Promise<Result> {
    if (!this.attached || this.contents.isDestroyed()) throw new BrowserError('UNAVAILABLE', '调试器会话不可用');
    return this.contents.debugger.sendCommand(method, parameters) as Promise<Result>;
  }

  dispose(): void {
    if (this.attached && !this.contents.isDestroyed() && this.contents.debugger.isAttached()) this.contents.debugger.detach();
    this.attached = false;
  }
}
