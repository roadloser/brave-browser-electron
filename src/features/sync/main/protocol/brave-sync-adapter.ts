import { BrowserError } from '../../../../shared/errors';
import { signingIdentity } from '../crypto/auth';
import { encodeProto, decodeProto } from './schema';
import type { ProgressMarker, SyncEntity, SyncProtocolPort, SyncRequestContext, SyncResponse } from './types';

export class BraveSyncAdapter implements SyncProtocolPort {
  readonly id = 'brave-sync-v2';
  readonly version = 'chromium150-go-sync-fields-v1';

  getUpdates(context: SyncRequestContext, markers: ProgressMarker[]): Promise<SyncResponse> {
    return this.send(context, {
      message_contents: 2,
      get_updates: { fetch_folders: true, from_progress_marker: markers, need_encryption_key: true, get_updates_origin: context.birthday ? 4 : 9 },
    });
  }
  commit(context: SyncRequestContext, entities: SyncEntity[], dataTypes: number[]): Promise<SyncResponse> {
    return this.send(context, { message_contents: 1, commit: { entries: entities, cache_guid: context.deviceId, config_params: { enabled_type_ids: dataTypes } } });
  }
  private async send(context: SyncRequestContext, contents: Record<string, unknown>): Promise<SyncResponse> {
    const endpoint = new URL(context.endpoint.endsWith('/') ? context.endpoint : context.endpoint + '/');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new BrowserError('FORBIDDEN', '同步服务必须使用不含凭据的 HTTPS 地址');
    const official = endpoint.hostname === 'sync-v2.brave.com';
    if (official && !context.serviceKey) throw new BrowserError('UNAVAILABLE', 'Brave 官方服务需要合法的 service key，当前未配置');
    const identity = signingIdentity(context.words);
    const body = encodeProto('ClientToServerMessage', {
      share: identity.share, protocol_version: 99, client_status: { is_sync_feature_enabled: true },
      store_birthday: context.birthday || undefined,
      bag_of_chips: context.chips ? { server_chips: Buffer.from(context.chips, 'base64') } : undefined, ...contents,
    });
    const response = await fetch(new URL('command/', endpoint), {
      method: 'POST', headers: {
        'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + identity.accessToken(),
        ...(context.serviceKey ? { 'x-brave-key': context.serviceKey } : {}),
      },
      body, signal: AbortSignal.any([context.signal, AbortSignal.timeout(30000)]), redirect: 'error',
    });
    if (response.status === 401 || response.status === 403) throw new BrowserError('FORBIDDEN', '同步服务拒绝认证，请核对服务资格、同步代码与设备时间');
    if (response.status === 429) throw new BrowserError('UNAVAILABLE', '同步服务限流，请稍后重试');
    if (!response.ok) throw new BrowserError('UNAVAILABLE', '同步服务返回 HTTP ' + response.status);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 32 * 1024 * 1024) throw new BrowserError('UNAVAILABLE', '同步响应超出允许大小');
    const reader = response.body?.getReader();
    if (!reader) throw new BrowserError('UNAVAILABLE', '同步服务返回空响应');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 32 * 1024 * 1024) { await reader.cancel(); throw new BrowserError('UNAVAILABLE', '同步响应超出允许大小'); }
      chunks.push(chunk.value);
    }
    const bytes = Buffer.concat(chunks);
    const result = decodeProto<SyncResponse>('ClientToServerResponse', bytes);
    const code = result.error?.error_type ?? result.error_code;
    if (code !== 0) {
      if (code === 2) throw new BrowserError('CONFLICT', '服务器同步链已重置；请确认后离开并重新加入，当前本地数据未清除');
      throw new BrowserError('UNAVAILABLE', '同步协议拒绝请求（错误 ' + String(code ?? 'unknown') + '）');
    }
    return result;
  }
}
