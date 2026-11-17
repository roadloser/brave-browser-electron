import type { Migration } from '../../../shared/runtime-ports';

export const tabGroupMigrations: readonly Migration[] = [{
  id: 'tab-groups',
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS tab_groups (
        id TEXT PRIMARY KEY,
        window_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        collapsed INTEGER NOT NULL DEFAULT 0,
        tab_ids TEXT NOT NULL,
        position INTEGER NOT NULL,
        revision INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS tab_groups_window ON tab_groups(window_id, position);
    `);
  },
}];
