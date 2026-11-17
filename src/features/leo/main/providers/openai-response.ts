import { createParser } from 'eventsource-parser';
import { ProviderFailure, type ProviderResponse, type ProviderToolCall } from './provider';

type RawToolCall = { index?: number; id?: string; function?: { name?: string; arguments?: string } };
type Completion = {
  choices?: Array<{ delta?: { content?: string; tool_calls?: RawToolCall[] }; message?: { content?: string; tool_calls?: RawToolCall[] }; finish_reason?: string | null }>;
  error?: { message?: string };
};

export async function readModelResponse(response: Response, streaming: boolean, onText: (text: string) => void, signal: AbortSignal): Promise<ProviderResponse> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new ProviderFailure('credentials', '模型服务拒绝凭据，请更新授权');
    if (response.status === 429) throw new ProviderFailure('rate-limit', '模型请求过于频繁，请稍后重试', Number(response.headers.get('retry-after')) || undefined);
    throw new ProviderFailure('network', `模型服务请求失败（${response.status}）`);
  }
  let text = '';
  const calls = new Map<number, ProviderToolCall>();
  const consume = (data: Completion, delta: boolean) => {
    if (data.error) throw new ProviderFailure('protocol', '模型服务返回错误，请检查模型配置后重试');
    const choice = data.choices?.[0];
    if (!choice) return false;
    const message = delta ? choice.delta : choice.message;
    if (choice.finish_reason === 'length') throw new ProviderFailure('capability', '模型达到输出长度限制，请缩短问题或继续提问');
    if (choice.finish_reason === 'content_filter') throw new ProviderFailure('capability', '模型服务未返回此请求的内容');
    if (typeof message?.content === 'string') { text += message.content; onText(message.content); }
    for (const [position, fragment] of (message?.tool_calls ?? []).entries()) {
      const index = fragment.index ?? position;
      const current = calls.get(index) ?? { id: '', name: '', arguments: '' };
      if (fragment.id) current.id = fragment.id;
      if (fragment.function?.name) current.name += fragment.function.name;
      if (fragment.function?.arguments) current.arguments += fragment.function.arguments;
      if (current.arguments.length > 100000) throw new ProviderFailure('protocol', '工具参数过大');
      calls.set(index, current);
    }
    return Boolean(choice.finish_reason);
  };
  const result = () => {
    const toolCalls = [...calls.entries()].sort(([left], [right]) => left - right).map(([, call]) => call);
    if (toolCalls.some((call) => !call.id || !call.name)) throw new ProviderFailure('protocol', '模型工具调用缺少标识');
    if (!text && !toolCalls.length) throw new ProviderFailure('protocol', '模型没有返回文本或工具调用');
    return { text, toolCalls };
  };
  if (!streaming || !response.headers.get('content-type')?.includes('text/event-stream')) {
    consume(await response.json() as Completion, false);
    return result();
  }
  if (!response.body) throw new ProviderFailure('protocol', '模型没有返回响应流');
  let finished = false;
  let failure: Error | undefined;
  const parser = createParser({
    onEvent(event) {
      if (event.data === '[DONE]') { finished = true; return; }
      try { if (consume(JSON.parse(event.data) as Completion, true)) finished = true; }
      catch (error) { failure = error instanceof Error ? error : new ProviderFailure('protocol', '模型响应无法解析'); }
    },
    onError(error) {
      if (error.type !== 'unknown-field') failure = new ProviderFailure('protocol', '模型流格式无效');
    },
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      if (signal.aborted) throw new ProviderFailure('cancelled', '请求已取消');
      const chunk = await reader.read();
      if (chunk.done) break;
      parser.feed(decoder.decode(chunk.value, { stream: true }));
      if (failure) throw failure;
      if (finished) break;
    }
    parser.feed(decoder.decode());
    if (failure) throw failure;
    if (!finished) throw new ProviderFailure('protocol', '响应流提前断开，可重试此消息');
    return result();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
