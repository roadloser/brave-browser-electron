import { createHash, createHmac } from 'node:crypto';
import { net } from 'electron';
import { ProviderFailure, type ProviderPort, type ProviderRequest } from './provider';
import { readModelResponse } from './openai-response';

export class BraveLeoProvider implements ProviderPort {
  readonly id = 'brave' as const;
  readonly adapterVersion = 'brave-conversation-v1-hs2019';
  availability() {
    const available = Boolean(process.env.BRAVE_LEO_SERVICE_KEY && process.env.BRAVE_LEO_SIGNING_KEY && process.env.BRAVE_LEO_KEY_ID);
    return { available, reason: available ? undefined : '官方 Leo 需要服务凭据、签名密钥及 keyId；自定义模型可单独使用' };
  }
  async send(request: ProviderRequest) {
    if (!this.availability().available) throw new ProviderFailure('credentials', this.availability().reason!);
    const endpoint = new URL(request.model.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/v1/chat/completions' ||
        !/^ai-chat(-premium)?\.bsg\.(brave\.com|bravesoftware\.com|brave\.software)$/.test(endpoint.hostname) ||
        endpoint.port || endpoint.username || endpoint.password || endpoint.search) {
      throw new ProviderFailure('capability', '官方 Leo 仅接受已确认的 Brave 会话服务地址');
    }
    const payload = JSON.stringify({
      messages: request.messages, brave_capability: [], model: request.model.model,
      system_language: 'zh_CN', stream: request.model.stream,
    });
    const digest = `SHA-256=${createHash('sha256').update(payload).digest('base64')}`;
    const keyId = process.env.BRAVE_LEO_KEY_ID!;
    if (!/^[A-Za-z0-9._:-]+$/.test(keyId)) throw new ProviderFailure('credentials', '官方服务 keyId 格式无效');
    const signature = createHmac('sha256', process.env.BRAVE_LEO_SIGNING_KEY!).update(`digest: ${digest}`).digest('base64');
    const premium = endpoint.hostname.startsWith('ai-chat-premium.');
    const premiumCredential = process.env.BRAVE_LEO_PREMIUM_CREDENTIAL;
    if (premium && !premiumCredential) throw new ProviderFailure('credentials', '此官方模型需要有效的 Leo Premium 凭据');
    const response = await net.fetch(endpoint.href, {
      method: 'POST', signal: request.signal, redirect: 'error', credentials: 'omit',
      headers: {
        'Content-Type': 'application/json', 'x-brave-key': process.env.BRAVE_LEO_SERVICE_KEY!,
        digest, Authorization: `Signature keyId="${keyId}",algorithm="hs2019",headers="digest",signature="${signature}"`,
        Accept: request.model.stream ? 'text/event-stream' : 'application/json',
        ...(premium ? { Cookie: `__Secure-sku#brave-leo-premium=${premiumCredential}` } : {}),
      },
      body: payload,
    });
    await readModelResponse(response, request.model.stream, request.onText, request.signal);
  }
  dispose() {}
}
