import type { ModelConfiguration } from '../../../shared/contracts/leo';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import type { LeoStateStore } from './state-store';

export class ModelService {
  constructor(private readonly runtime: FeatureRuntime, private readonly store: LeoStateStore) {}
  save(context: CommandContext, input: Omit<ModelConfiguration, 'hasKey'> & { apiKey?: string }) {
    const endpoint = new URL(input.endpoint);
    if (endpoint.username || endpoint.password || endpoint.hash) throw new BrowserError('INVALID_ARGUMENT', '模型地址不能包含密码或片段');
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) {
      throw new BrowserError('INVALID_ARGUMENT', '远程模型使用 HTTPS，本地模型可使用 HTTP');
    }
    if (input.apiKey && !this.runtime.secrets.available()) throw new BrowserError('UNAVAILABLE', '系统安全存储不可用，不能保存模型密钥');
    const encryptedKey = input.apiKey ? this.runtime.secrets.encrypt(input.apiKey) : undefined;
    return this.store.update(context, (document) => {
      const previous = document.models.find((model) => model.id === input.id);
      const { apiKey: _apiKey, ...configuration } = input;
      const key = input.apiKey === undefined ? previous?.encryptedKey : encryptedKey;
      const model = { ...configuration, hasKey: Boolean(key), encryptedKey: key, unauthorized: false };
      const index = document.models.findIndex((entry) => entry.id === model.id);
      if (index < 0) document.models.push(model); else document.models[index] = model;
    });
  }
  key(context: CommandContext, modelId: string) {
    const model = this.store.get(context).models.find((entry) => entry.id === modelId);
    if (!model) throw new BrowserError('NOT_FOUND', '模型配置已被移除');
    if (model.unauthorized) throw new BrowserError('FORBIDDEN', '模型凭据已失效，请更新配置后重试');
    return model.encryptedKey ? this.runtime.secrets.decrypt(model.encryptedKey) : undefined;
  }
  invalidate(context: CommandContext, modelId: string) {
    this.store.update(context, (document) => {
      const model = document.models.find((entry) => entry.id === modelId);
      if (model) { model.unauthorized = true; model.encryptedKey = undefined; model.hasKey = false; }
    });
  }
}
