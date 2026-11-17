import type { FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { SyncState } from '../../../../shared/contracts/sync';
import type { SyncRepository, SyncConfiguration } from '../repository';
import { BrowserError } from '../../../../shared/errors';
import { clientTagHash } from './data-mapping';
import { assertCommitted } from './response';
import type { NigoriController } from './nigori-controller';
import type { SyncEntity, SyncProtocolPort, SyncRequestContext } from './types';

type SessionHeader = { client_name?: string; window?: Array<{ window_id?: number; tab?: number[] }> };
type SessionTab = { tab_id?: number; window_id?: number; current_navigation_index?: number; navigation?: Array<{ virtual_url?: string; title?: string }> };
export type SessionSpecifics = { session_tag?: string; tab_node_id?: number; header?: SessionHeader; tab?: SessionTab };
type SessionRecord = { entity: SyncEntity; specifics: SessionSpecifics; modified: number };

export class SessionController {
  constructor(private readonly runtime: FeatureRuntime, private readonly repository: SyncRepository) {}

  import(profileId: string, remote: SyncEntity[], nigori: NigoriController): void {
    const records = this.repository.metadata<Record<string, SessionRecord>>(profileId, 'remote-sessions') ?? {};
    const devices = this.repository.metadata<Record<string, { id: string; name: string; lastSeen: number }>>(profileId, 'remote-devices') ?? {};
    const ownDevice = this.repository.configuration(profileId)?.deviceId;
    for (const entity of remote) {
      if (!entity.id_string) continue;
      if (entity.deleted) { delete records[entity.id_string]; delete devices[entity.id_string]; continue; }
      const specifics = nigori.decrypt(entity.specifics ?? {});
      if (specifics.session?.session_tag && specifics.session.session_tag !== ownDevice) {
        const session = specifics.session;
        if (session.header || session.tab) records[entity.id_string] = { entity, specifics: session, modified: Number(entity.mtime ?? 0) };
      }
      const device = specifics.device_info;
      if (typeof device?.cache_guid === 'string' && device.cache_guid !== ownDevice) {
        devices[entity.id_string] = { id: device.cache_guid, name: String(device.client_name ?? '其他设备'), lastSeen: Number(device.last_updated_timestamp ?? entity.mtime ?? 0) };
      }
    }
    this.repository.setMetadata(profileId, 'remote-sessions', records);
    this.repository.setMetadata(profileId, 'remote-devices', devices);
  }

  state(profileId: string): Pick<SyncState, 'remoteTabs' | 'remoteDevices'> {
    const records = Object.values(this.repository.metadata<Record<string, SessionRecord>>(profileId, 'remote-sessions') ?? {});
    const devices = Object.values(this.repository.metadata<Record<string, { id: string; name: string; lastSeen: number }>>(profileId, 'remote-devices') ?? {});
    const headers = records.filter(record => record.specifics.header);
    const tabs: SyncState['remoteTabs'] = [];
    for (const header of headers) {
      const deviceId = header.specifics.session_tag!;
      const included = new Set(header.specifics.header?.window?.flatMap(window => window.tab ?? []) ?? []);
      if (!devices.some(device => device.id === deviceId)) devices.push({ id: deviceId, name: header.specifics.header?.client_name ?? '其他设备', lastSeen: header.modified });
      for (const record of records.filter(candidate => candidate.specifics.session_tag === deviceId && candidate.specifics.tab)) {
        const tab = record.specifics.tab!;
        if (!included.has(tab.tab_id ?? -1)) continue;
        const navigation = tab.navigation?.[tab.current_navigation_index ?? -1];
        if (!navigation?.virtual_url || !/^https?:/i.test(navigation.virtual_url)) continue;
        tabs.push({ deviceId, tabId: String(record.specifics.tab_node_id), title: navigation.title || navigation.virtual_url, url: navigation.virtual_url, lastModified: record.modified });
      }
    }
    return { remoteTabs: tabs, remoteDevices: devices };
  }

  async upload(profileId: string, configuration: SyncConfiguration, context: SyncRequestContext, nigori: NigoriController, protocol: SyncProtocolPort, ids: number[]): Promise<void> {
    const snapshot = this.runtime.syncTabs.snapshot(profileId);
    const allocated = this.repository.metadata<Record<string, number>>(profileId, 'session-ids') ?? {};
    let next = Math.max(0, ...Object.values(allocated)) + 1;
    const numberFor = (key: string) => {
      if (allocated[key] === undefined) allocated[key] = next++;
      return allocated[key];
    };
    const previous = this.repository.metadata<Record<string, SyncEntity>>(profileId, 'own-sessions') ?? {};
    const wanted = new Map<string, SessionSpecifics>();
    const headerWindows = snapshot.windows.map(window => {
      const windowId = numberFor('window:' + window.id);
      const tabIds = window.tabs.map(tab => numberFor('tab:' + tab.id));
      window.tabs.forEach((tab, index) => {
        const numericId = tabIds[index];
        const tag = configuration.deviceId + ' ' + numericId;
        wanted.set(tag, {
          session_tag: configuration.deviceId, tab_node_id: numericId,
          tab: {
            tab_id: numericId, window_id: windowId,
            current_navigation_index: tab.activeIndex,
            ...{ tab_visual_index: index, pinned: tab.pinned, browser_type: 1 },
            navigation: tab.navigation.map(entry => ({ virtual_url: entry.url, title: entry.title })),
          },
        });
      });
      return { window_id: windowId, selected_tab_index: window.tabs.findIndex(tab => tab.id === window.activeTabId), browser_type: 1, tab: tabIds };
    });
    wanted.set(configuration.deviceId, { session_tag: configuration.deviceId, header: { client_name: configuration.deviceName, window: headerWindows } });
    this.repository.setMetadata(profileId, 'session-ids', allocated);
    const entries: Array<{ tag: string; entity: SyncEntity }> = [...wanted].map(([tag, specifics]) => ({
      tag, entity: {
        id_string: previous[tag]?.id_string ?? tag, version: previous[tag]?.version ?? '0',
        client_tag_hash: clientTagHash('session', tag), name: 'encrypted', mtime: String(Date.now()),
        specifics: nigori.encrypt({ session: specifics }, 'session'),
      },
    }));
    for (const [tag, old] of Object.entries(previous)) if (!wanted.has(tag)) entries.push({ tag, entity: { ...old, deleted: true } });
    for (let offset = 0; offset < entries.length; offset += 100) {
      context.signal.throwIfAborted();
      const batch = entries.slice(offset, offset + 100);
      const results = assertCommitted(await protocol.commit(context, batch.map(entry => entry.entity), ids), batch.length);
      this.repository.database(profileId).transaction(() => {
        results.forEach((result, index) => {
          const entry = batch[index];
          if (entry.entity.deleted) delete previous[entry.tag];
          else previous[entry.tag] = { ...entry.entity, id_string: result.id_string ?? entry.entity.id_string, version: result.version ?? entry.entity.version };
        });
        this.repository.setMetadata(profileId, 'own-sessions', previous);
      });
    }
  }

  async open(profileId: string, windowId: string, deviceId: string, tabId: string): Promise<void> {
    const tab = this.state(profileId).remoteTabs.find(candidate => candidate.deviceId === deviceId && candidate.tabId === tabId);
    if (!tab) throw new BrowserError('NOT_FOUND', '远端标签已不存在，请重新同步');
    await this.runtime.core.openTab({ windowId, url: tab.url });
  }
}
