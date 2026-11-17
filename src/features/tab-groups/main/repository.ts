import type { TabGroup, GroupColor } from '../../../shared/contracts/tab-groups';
import type { ProfileDatabase } from '../../../shared/runtime-ports';

type GroupRow = {
  id: string;
  window_id: string;
  name: string;
  color: GroupColor;
  collapsed: number;
  tab_ids: string;
  position: number;
  revision: number;
};

export class TabGroupRepository {
  constructor(private readonly database: ProfileDatabase) {}

  list(windowId: string): TabGroup[] {
    return this.database.all<GroupRow>(
      'SELECT * FROM tab_groups WHERE window_id = ? ORDER BY position', [windowId],
    ).map((row) => ({
      id: row.id, windowId: row.window_id, name: row.name, color: row.color,
      collapsed: Boolean(row.collapsed), tabIds: JSON.parse(row.tab_ids) as string[],
      position: row.position, revision: row.revision,
    }));
  }

  replace(windowId: string, groups: readonly TabGroup[]) {
    this.database.transaction(() => {
      this.database.run('DELETE FROM tab_groups WHERE window_id = ?', [windowId]);
      for (const group of groups) {
        this.database.run(
          'INSERT INTO tab_groups (id, window_id, name, color, collapsed, tab_ids, position, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [group.id, group.windowId, group.name, group.color, Number(group.collapsed),
            JSON.stringify(group.tabIds), group.position, group.revision],
        );
      }
    });
  }
}
