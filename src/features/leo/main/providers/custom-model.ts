import { net } from 'electron';
import { ProviderFailure, type ProviderPort, type ProviderRequest } from './provider';
import { readModelResponse } from './openai-response';

export class CustomModelProvider implements ProviderPort {
  readonly id = 'custom' as const;
  readonly adapterVersion = 'openai-chat-completions-v1';
  availability() { return { available: true }; }
  async send(request: ProviderRequest) {
    const endpoint = new URL(request.model.endpoint);
    if (endpoint.username || endpoint.password) throw new ProviderFailure('credentials', '请使用独立凭据字段，不要把密码放入地址');
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) {
      throw new ProviderFailure('capability', '远程模型需要 HTTPS；本机模型可使用 HTTP');
    }
    const response = await net.fetch(endpoint.href, {
      method: 'POST', signal: request.signal, redirect: 'error', credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        ...(request.apiKey ? { Authorization: `Bearer ${request.apiKey}` } : {}),
        Accept: request.model.stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify({ model: request.model.model, messages: request.messages, stream: request.model.stream }),
    });
    await readModelResponse(response, request.model.stream, request.onText, request.signal);
  }
  dispose() {}
}
