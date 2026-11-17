import type { Migration } from '../../../shared/runtime-ports';

export const BOOKMARK_BAR_ID = 'bookmarks-bar';
export const OTHER_BOOKMARKS_ID = 'other-bookmarks';
export const BOOKMARK_ROOT_IDS = new Set([BOOKMARK_BAR_ID, OTHER_BOOKMARKS_ID]);

export const bookmarkMigrations: readonly Migration[] = [{
  id: 'bookmarks.initial',
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE bookmarks (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES bookmarks(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('folder', 'bookmark')),
        title TEXT NOT NULL,
        url TEXT,
        position INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK ((kind = 'folder' AND url IS NULL) OR (kind = 'bookmark' AND url IS NOT NULL))
      );
      CREATE INDEX bookmarks_parent_position ON bookmarks(parent_id, position);
      CREATE TABLE bookmark_state (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL);
      INSERT INTO bookmark_state (id, revision) VALUES (1, 0);
    `);
    const timestamp = Date.now();
    database.run(
      'INSERT INTO bookmarks (id,parent_id,kind,title,url,position,created_at,updated_at) VALUES (?,NULL,?, ?,NULL,?,?,?)',
      [BOOKMARK_BAR_ID, 'folder', '书签栏', 0, timestamp, timestamp],
    );
    database.run(
      'INSERT INTO bookmarks (id,parent_id,kind,title,url,position,created_at,updated_at) VALUES (?,NULL,?,?,NULL,?,?,?)',
      [OTHER_BOOKMARKS_ID, 'folder', '其他书签', 1, timestamp, timestamp],
    );
  },
}];
