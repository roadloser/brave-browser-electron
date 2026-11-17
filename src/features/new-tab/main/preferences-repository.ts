import type { NewTabState } from '../../../shared/contracts/new-tab';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';

export const newTabMigrations: readonly Migration[] = [{
  id: 'new-tab', version: 1,
  up(database) {
    database.exec('CREATE TABLE IF NOT EXISTS new_tab_preferences (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL)');
  },
}];

export function defaultNewTabState(): NewTabState {
  return {
    preferences: { background: { kind: 'gradient', value: 'dusk' }, showClock: true, showShortcuts: true, shortcuts: [] },
    images: [], revision: 0,
  };
}

export class NewTabPreferencesRepository {
  constructor(private readonly database: ProfileDatabase) {}
  read(): NewTabState {
    const record = this.database.get<{ state: string }>('SELECT state FROM new_tab_preferences WHERE id = 1');
    return record ? JSON.parse(record.state) as NewTabState : defaultNewTabState();
  }
  write(state: NewTabState) {
    this.database.transaction(() => this.database.run(
      'INSERT INTO new_tab_preferences (id, state) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state',
      [JSON.stringify(state)],
    ));
  }
}
