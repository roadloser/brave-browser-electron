import { createParser } from 'eventsource-parser';
import { ProviderFailure } from './provider';

type Completion = {
  choices?: Array<{ delta?: { content?: string; tool_calls?: unknown }; message?: { content?: string; tool_calls?: unknown }; finish_reason?: string | null }>;
  error?: { message?: string };
};

function contentOf(data: Completion, streaming: boolean) {
  if (data.error) throw new ProviderFailure('protocol', '模型服务返回错误，请检查模型配置后重试');
  const choice = data.choices?.[0];
  if (!choice) return { text: '', done: false };
  const message = streaming ? choice.delta : choice.message;
  if (message?.tool_calls) throw new ProviderFailure('capability', '模型请求了工具调用；当前对话未授权工具执行');
  if (choice.finish_reason === 'length') throw new ProviderFailure('capability', '模型达到输出长度限制，请缩短问题或继续提问');
  if (choice.finish_reason === 'content_filter') throw new ProviderFailure('capability', '模型服务未返回此请求的内容');
  return { text: typeof message?.content === 'string' ? message.content : '', done: Boolean(choice.finish_reason) };
}

export async function readModelResponse(response: Response, streaming: boolean, onText: (text: string) => void, signal: AbortSignal) {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new ProviderFailure('credentials', '模型服务拒绝凭据，请更新授权');
    if (response.status === 429) throw new ProviderFailure('rate-limit', '模型请求过于频繁，请稍后重试', Number(response.headers.get('retry-after')) || undefined);
    throw new ProviderFailure('network', `模型服务请求失败（${response.status}）`);
  }
  if (!streaming || !response.headers.get('content-type')?.includes('text/event-stream')) {
    const parsed = contentOf(await response.json() as Completion, false);
    if (!parsed.text) throw new ProviderFailure('protocol', '模型没有返回文本内容');
    onText(parsed.text); return;
  }
  if (!response.body) throw new ProviderFailure('protocol', '模型没有返回响应流');
  let finished = false;
  let failure: Error | undefined;
  const parser = createParser({
    onEvent(event) {
      if (event.data === '[DONE]') { finished = true; return; }
      try {
        const result = contentOf(JSON.parse(event.data) as Completion, true);
        if (result.text) onText(result.text);
        if (result.done) finished = true;
      } catch (error) { failure = error instanceof Error ? error : new ProviderFailure('protocol', '模型响应无法解析'); }
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
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
