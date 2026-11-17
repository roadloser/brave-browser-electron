import { randomUUID } from 'node:crypto';
import type { HistoryEntry, HistoryPage } from '../../../shared/contracts/history';
import type { NavigationCommitted } from '../../../shared/contracts/browser-core';
import type { CommandPayload } from '../../../shared/contracts/envelope';
import type { ProfileDatabase, SqlValue } from '../../../shared/runtime-ports';

type Range = { from?: number; to?: number };

export class HistoryRepository {
  constructor(private readonly database: ProfileDatabase) {}

  record(visit: NavigationCommitted): boolean {
    return this.database.transaction(() => {
      const result = this.database.run(
        'INSERT OR IGNORE INTO history_visits(id,navigation_key,url,title,visited_at,source) VALUES (?,?,?,?,?,?)',
        [randomUUID(), this.navigationKey(visit.contextId, visit.navigationId), visit.url, visit.title || visit.url, visit.timestamp, visit.source],
      );
      if (result.changes) this.bump();
      return result.changes > 0;
    });
  }

  updateTitle(contextId: string, navigationId: string, title: string): boolean {
    if (!title.trim()) return false;
    return this.database.transaction(() => {
      const result = this.database.run('UPDATE history_visits SET title=? WHERE navigation_key=? AND title<>?', [
        title, this.navigationKey(contextId, navigationId), title,
      ]);
      if (result.changes) this.bump();
      return result.changes > 0;
    });
  }

  query(input: CommandPayload<'history.query'>): HistoryPage {
    const filter = this.range(input);
    if (input.query?.trim()) {
      filter.clauses.push("(title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')");
      const query = `%${input.query.trim().replace(/[\\%_]/g, '\\$&')}%`;
      filter.values.push(query, query);
    }
    const where = filter.clauses.length ? `WHERE ${filter.clauses.join(' AND ')}` : '';
    const total = this.database.get<{ total: number }>(`SELECT COUNT(*) AS total FROM history_visits ${where}`, filter.values)?.total ?? 0;
    const entries = this.database.all<HistoryEntry>(`
      SELECT visits.id, visits.url, visits.title, visits.visited_at AS visitedAt,
        (SELECT COUNT(*) FROM history_visits related WHERE related.url=visits.url) AS visitCount
      FROM history_visits visits ${where} ORDER BY visited_at DESC,id DESC LIMIT ? OFFSET ?
    `, [...filter.values, input.limit, input.offset]);
    const next = input.offset + entries.length;
    return { entries, total, revision: this.revision(), nextOffset: next < total ? next : null };
  }

  remove(ids: string[]): { removed: number; revision: number } {
    return this.database.transaction(() => {
      const placeholders = ids.map(() => '?').join(',');
      const result = this.database.run(`DELETE FROM history_visits WHERE id IN (${placeholders})`, ids);
      if (result.changes) this.bump();
      return { removed: result.changes, revision: this.revision() };
    });
  }

  clear(input: Range): { removed: number; revision: number } {
    return this.database.transaction(() => {
      const filter = this.range(input);
      const where = filter.clauses.length ? `WHERE ${filter.clauses.join(' AND ')}` : '';
      const result = this.database.run(`DELETE FROM history_visits ${where}`, filter.values);
      if (result.changes) this.bump();
      return { removed: result.changes, revision: this.revision() };
    });
  }

  revision(): number {
    return this.database.get<{ revision: number }>('SELECT revision FROM history_state WHERE id=1')?.revision ?? 0;
  }

  private navigationKey(contextId: string, navigationId: string): string {
    return `${contextId}:${navigationId}`;
  }

  private range(input: Range): { clauses: string[]; values: SqlValue[] } {
    const clauses: string[] = [];
    const values: SqlValue[] = [];
    if (input.from !== undefined) { clauses.push('visited_at>=?'); values.push(input.from); }
    if (input.to !== undefined) { clauses.push('visited_at<?'); values.push(input.to); }
    return { clauses, values };
  }

  private bump(): void {
    this.database.run('UPDATE history_state SET revision=revision+1 WHERE id=1');
  }
}
