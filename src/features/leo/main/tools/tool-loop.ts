import type { LeoMessage, LeoToolUse } from '../../../../shared/contracts/leo';
import type { CommandContext } from '../../../../shared/module-lifecycle';
import type { ProviderPort, ProviderRequest, ProviderMessage } from '../providers/provider';
import { ProviderFailure } from '../providers/provider';
import type { LeoStateStore } from '../state-store';
import type { ActiveRequest } from '../request-runner';
import { ToolInteraction } from './tool-interaction';
import { conversationTools, normalizeTool } from './conversation-tools';

export class ToolLoop {
  readonly interaction = new ToolInteraction();
  constructor(private readonly store: LeoStateStore, private readonly publish: (context: CommandContext) => void) {}
  async execute(active: ActiveRequest, provider: ProviderPort, request: ProviderRequest) {
    const messages: ProviderMessage[] = [...request.messages];
    for (let round = 0; round < 12; round++) {
      const result = await provider.send({ ...request, messages, tools: request.model.supportsTools ? conversationTools : undefined });
      if (!result.toolCalls.length) return;
      if (!request.model.supportsTools) throw new ProviderFailure('capability', '模型未启用工具能力');
      const tools = result.toolCalls.map(normalizeTool);
      for (const tool of tools) if (tool.name === 'user_choice_tool' && tool.input.choice_type === 'follow_up') {
        tool.status = 'completed';
        tool.output = '后续建议已显示';
      }
      this.update(active, (message) => { message.toolUses = [...(message.toolUses ?? []), ...tools]; });
      messages.push({ role: 'assistant', content: result.text, tool_calls: result.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) });
      for (const tool of tools) {
        if (active.controller.signal.aborted) throw new ProviderFailure('cancelled', '请求已取消');
        let output: string;
        if (tool.name === 'assistant_detail_storage') output = String(tool.input.information);
        else if (tool.input.choice_type === 'follow_up') output = '后续建议已显示，等待用户下一条消息。';
        else {
          active.status = 'waiting-for-user';
          this.publish(active.context);
          output = await this.interaction.wait(active.context, active.id, tool, active.controller.signal);
          active.status = 'running';
        }
        this.update(active, (message) => {
          const stored = message.toolUses?.find((entry) => entry.id === tool.id);
          if (stored) { stored.output = output; stored.status = output === '用户拒绝了此工具请求。' ? 'rejected' : 'completed'; }
        });
        messages.push({ role: 'tool', tool_call_id: tool.id, content: output });
      }
      if (tools.every((tool) => tool.name === 'user_choice_tool' && tool.input.choice_type === 'follow_up')) return;
    }
    throw new ProviderFailure('capability', '工具调用已达到本轮上限，请继续发送消息');
  }
  dispose() { this.interaction.dispose(); }
  private update(active: ActiveRequest, update: (message: LeoMessage) => void) {
    if (!this.store.has(active.context)) throw new ProviderFailure('cancelled', '会话已关闭');
    this.store.update(active.context, (document) => {
      const message = document.conversations.find((entry) => entry.id === active.conversationId)?.messages.find((entry) => entry.id === active.assistantId);
      if (!message) throw new ProviderFailure('cancelled', '对话已被删除');
      update(message);
    });
    this.publish(active.context);
  }
}
