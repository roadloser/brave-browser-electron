import type { Migration, StorageHost } from '../../../shared/runtime-ports';
import type { TorComponent } from './component-descriptor';
export const torMigrations: Migration[] = [{
  id: 'tor.component-selection', version: 1,
  up: database => database.exec('CREATE TABLE tor_components (id INTEGER PRIMARY KEY CHECK(id=1), current TEXT NOT NULL, previous TEXT)'),
}];
export class TorRepository {
  constructor(private readonly storage: StorageHost) {}
  get(profileId: string): { current?: TorComponent; previous?: TorComponent } {
    const row = this.storage.open(profileId).get<{ current: string; previous: string | null }>('SELECT current,previous FROM tor_components WHERE id=1');
    return row ? { current: JSON.parse(row.current), previous: row.previous ? JSON.parse(row.previous) : undefined } : {};
  }
  select(profileId: string, component: TorComponent): void {
    const current = this.get(profileId).current;
    this.storage.open(profileId).run('INSERT INTO tor_components(id,current,previous) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET previous=tor_components.current,current=excluded.current',
      [JSON.stringify(component), current ? JSON.stringify(current) : null]);
  }
  rollback(profileId: string): void {
    this.storage.open(profileId).run('UPDATE tor_components SET current=previous,previous=current WHERE id=1 AND previous IS NOT NULL');
  }
}
