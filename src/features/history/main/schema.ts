import type { Migration } from '../../../shared/runtime-ports';

export const historyMigrations: readonly Migration[] = [{
  id: 'history.initial',
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE history_visits (
        id TEXT PRIMARY KEY,
        navigation_key TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        visited_at INTEGER NOT NULL,
        source TEXT NOT NULL
      );
      CREATE INDEX history_time ON history_visits(visited_at DESC, id);
      CREATE INDEX history_url_time ON history_visits(url, visited_at DESC);
      CREATE TABLE history_state (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL);
      INSERT INTO history_state (id, revision) VALUES (1, 0);
    `);
  },
}];
