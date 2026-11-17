import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncLocalType } from '../../../shared/sync-data-ports';
import { BrowserError } from '../../../shared/errors';
import { SyncRepository, type SyncConfiguration } from './repository';
import { ChangeJournal } from './change-journal';
import { RemoteApplier } from './remote-applier';
import { CommitUploader } from './commit-uploader';
import { NigoriController } from './protocol/nigori-controller';
import { assertCommitted } from './protocol/response';
import { clientTagHash, dataTypeIds } from './protocol/data-mapping';
import type { ProgressMarker, SyncEntity, SyncProtocolPort, SyncRequestContext } from './protocol/types';

export class SyncEngine {
  constructor(private readonly runtime: FeatureRuntime, private readonly repository: SyncRepository, private readonly protocol: SyncProtocolPort) {}

  async run(profileId: string, configuration: SyncConfiguration, signal: AbortSignal): Promise<void> {
    if (!configuration.encryptedWords) throw new BrowserError('UNAVAILABLE', '尚未加入同步链');
    const types = configuration.enabledTypes.filter((type): type is SyncLocalType => ['bookmarks', 'history', 'settings'].includes(type));
    const ids = [...types.map(type => dataTypeIds[type]), 47745, 154522, ...(types.includes('history') ? [150251] : [])];
    const context: SyncRequestContext = {
      words: this.runtime.secrets.decrypt(configuration.encryptedWords),
      endpoint: configuration.endpoint, serviceKey: configuration.encryptedServiceKey ? this.runtime.secrets.decrypt(configuration.encryptedServiceKey) : undefined,
      deviceId: configuration.deviceId, birthday: this.repository.metadata<string>(profileId, 'birthday'),
      chips: this.repository.metadata<string>(profileId, 'chips'), signal,
    };
    const journal = new ChangeJournal(this.runtime, this.repository);
    journal.capture(profileId, types);
    let markers: ProgressMarker[] = ids.map(data_type_id => ({
      data_type_id, token: Buffer.from(this.repository.metadata<string>(profileId, 'cursor:' + data_type_id) ?? '', 'base64'),
    }));
    const entities: SyncEntity[] = [];
    let exhausted = false;
    for (let page = 0; page < 100; page += 1) {
      signal.throwIfAborted();
      const response = await this.protocol.getUpdates(context, markers);
      if (!response.get_updates) throw new BrowserError('CONFLICT', '同步服务未返回 GetUpdates 结果');
      entities.push(...(response.get_updates.entries ?? []));
      if (entities.length > 100000) throw new BrowserError('UNAVAILABLE', '本次同步记录过多，请缩小数据类型后重试');
      for (const marker of response.get_updates.new_progress_marker ?? []) markers = markers.map(previous => previous.data_type_id === marker.data_type_id ? marker : previous);
      context.birthday = response.store_birthday ?? context.birthday;
      if (response.new_bag_of_chips?.server_chips) context.chips = response.new_bag_of_chips.server_chips.toString('base64');
      if (BigInt(response.get_updates.changes_remaining ?? '0') === 0n) { exhausted = true; break; }
    }
    if (!exhausted) throw new BrowserError('UNAVAILABLE', '同步分页尚未结束，本次游标尚未提交，请稍后重试');
    signal.throwIfAborted();
    let nigoriEntity = entities.find(entity => !!entity.specifics?.nigori) ?? this.repository.metadata<SyncEntity>(profileId, 'nigori');
    if (!nigoriEntity) throw new BrowserError('UNAVAILABLE', '同步服务尚未建立 Nigori 目录');
    const nigori = new NigoriController();
    try {
      const initialization = nigori.initialize(context.words, nigoriEntity);
      if (initialization) {
        const response = await this.protocol.commit(context, [initialization], ids);
        const result = assertCommitted(response, 1)[0];
        nigoriEntity = { ...initialization, id_string: result.id_string ?? initialization.id_string, version: result.version ?? initialization.version };
      }
      signal.throwIfAborted();
      this.repository.setMetadata(profileId, 'nigori', nigoriEntity);
      new RemoteApplier(this.runtime, this.repository).apply(profileId, entities, nigori, markers, context.birthday ?? '', context.chips);
      journal.capture(profileId, types);
      await this.registerDevice(profileId, configuration, context, nigori, ids);
      await new CommitUploader(this.repository, this.protocol).upload(profileId, context, nigori, ids);
    } finally { nigori.dispose(); }
  }

  private async registerDevice(profileId: string, configuration: SyncConfiguration, context: SyncRequestContext, nigori: NigoriController, ids: number[]): Promise<void> {
    const previous = this.repository.metadata<SyncEntity>(profileId, 'device');
    const entity: SyncEntity = {
      id_string: previous?.id_string ?? configuration.deviceId, version: previous?.version ?? '0',
      client_tag_hash: clientTagHash('device_info', configuration.deviceId), name: 'encrypted',
      specifics: nigori.encrypt({ device_info: {
        cache_guid: configuration.deviceId, client_name: configuration.deviceName,
        signin_scoped_device_id: configuration.deviceId, sync_user_agent: 'Brave Electron',
        last_updated_timestamp: String(Date.now()), pulse_interval_in_minutes: 60, os_type: 2, device_form_factor: 1,
      } }, 'device_info'),
    };
    const result = assertCommitted(await this.protocol.commit(context, [entity], ids), 1)[0];
    this.repository.setMetadata(profileId, 'device', { ...entity, id_string: result.id_string ?? entity.id_string, version: result.version ?? entity.version });
  }
}
