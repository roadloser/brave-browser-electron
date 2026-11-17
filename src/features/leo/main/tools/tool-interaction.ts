import type { CommandContext } from '../../../../shared/module-lifecycle';
import type { LeoToolUse } from '../../../../shared/contracts/leo';
import { BrowserError } from '../../../../shared/errors';

type WaitingTool = { contextId: string; choice: LeoToolUse; resolve: (result: string) => void; reject: (error: Error) => void; dispose: () => void };
export class ToolInteraction {
  private readonly pending = new Map<string, WaitingTool>();
  wait(context: CommandContext, requestId: string, tool: LeoToolUse, signal: AbortSignal) {
    if (signal.aborted) return Promise.reject(new BrowserError('CANCELLED', '请求已取消'));
    const key = `${requestId}:${tool.id}`;
    return new Promise<string>((resolve, reject) => {
      const cancel = () => { this.pending.delete(key); reject(new BrowserError('CANCELLED', '请求已取消')); };
      signal.addEventListener('abort', cancel, { once: true });
      this.pending.set(key, { contextId: context.contextId, choice: tool, resolve, reject,
        dispose: () => signal.removeEventListener('abort', cancel) });
    });
  }
  respond(context: CommandContext, requestId: string, toolId: string, choice: string, rejected: boolean) {
    const key = `${requestId}:${toolId}`;
    const pending = this.pending.get(key);
    if (!pending || pending.contextId !== context.contextId) throw new BrowserError('NOT_FOUND', '工具请求已结束或不属于当前窗口');
    if (!rejected && !(pending.choice.input.choices as string[]).includes(choice)) throw new BrowserError('INVALID_ARGUMENT', '请选择工具请求中的选项');
    pending.dispose(); this.pending.delete(key);
    pending.resolve(rejected ? '用户拒绝了此工具请求。' : choice);
  }
  dispose() {
    for (const pending of this.pending.values()) { pending.dispose(); pending.reject(new BrowserError('CANCELLED', '会话已退出')); }
    this.pending.clear();
  }
}
