import type { BrowserSettings } from '../../../shared/contracts/settings';
import { settingsSchema } from '../../../shared/contracts/settings';
import type { Migration, StorageHost } from '../../../shared/runtime-ports';

export const defaultSettings: BrowserSettings = {
  theme: 'system', startup: 'restore', searchEngine: 'brave',
  showBookmarksBar: true, verticalTabs: false, downloadAskEachTime: true,
  downloadDirectory: '', savePasswords: true, autofillEnabled: true, doNotTrack: false,
};
export const settingsMigrations: Migration[] = [{
  id: 'settings.initial', version: 1, up: database => database.exec('CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL)'),
}];

export class SettingsRepository {
  constructor(private readonly storage: StorageHost) {}
  get(profileId: string): BrowserSettings {
    const row = this.storage.open(profileId).get<{ payload: string }>('SELECT payload FROM settings WHERE id = 1');
    return row ? settingsSchema.parse({ ...defaultSettings, ...JSON.parse(row.payload) }) : { ...defaultSettings };
  }
  set(profileId: string, values: BrowserSettings): void {
    this.storage.open(profileId).transaction(() => this.storage.open(profileId).run(
      'INSERT INTO settings (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload', [JSON.stringify(values)],
    ));
  }
}
