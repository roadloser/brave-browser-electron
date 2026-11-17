import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import type { SyncDataAdapter } from '../../../shared/sync-data-ports';
import { settingsSchema } from '../../../shared/contracts/settings';
import { defaultSettings, SettingsRepository } from './repository';
import type { SettingsService } from './settings-service';

const keys = ['showBookmarksBar', 'verticalTabs', 'startup', 'doNotTrack'] as const;
export function createSettingsSyncAdapter(runtime: FeatureRuntime, service: SettingsService): SyncDataAdapter {
  const repository = new SettingsRepository(runtime.storage);
  return {
    snapshot(profileId) {
      const values = repository.get(profileId);
      return keys.map(name => ({ type: 'settings', id: name, value: { name, value: values[name], updatedAt: 0 } }));
    },
    apply(profileId, changes) {
      const values = repository.get(profileId);
      for (const change of changes) {
        if (change.operation === 'delete') {
          if (keys.includes(change.id as typeof keys[number])) Object.assign(values, { [change.id]: defaultSettings[change.id as typeof keys[number]] });
        } else if (change.item.type === 'settings' && keys.includes(change.item.value.name as typeof keys[number])) {
          Object.assign(values, { [change.item.value.name]: change.item.value.value });
        }
      }
      repository.set(profileId, settingsSchema.parse(values));
    },
    notify(profileId) { service.notifyImported(profileId); },
    subscribe(listener) { return service.subscribe(listener); },
  };
}
