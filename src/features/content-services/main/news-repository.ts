import type { NewsState } from '../../../shared/contracts/content-services';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';
import type { ScoredArticle, ScopedPublisher } from './providers/provider';

export type NewsDocument = {
  state: NewsState; catalog: ScopedPublisher[]; candidates: ScoredArticle[];
};
export const contentMigrations: readonly Migration[] = [{
  id: 'content-services', version: 1,
  up(database) { database.exec('CREATE TABLE IF NOT EXISTS news_document (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL)'); },
}];
export function defaultNewsDocument(): NewsDocument {
  return {
    state: { enabled: false, locale: 'en-US', publishers: [], enabledPublisherIds: [], disabledPublisherIds: [],
      channels: [], directFeeds: [], articles: [], lastUpdated: null, status: 'idle', revision: 0 },
    catalog: [], candidates: [],
  };
}
export class NewsRepository {
  constructor(private readonly database: ProfileDatabase) {}
  read(): NewsDocument {
    const row = this.database.get<{ document: string }>('SELECT document FROM news_document WHERE id = 1');
    const document = row ? JSON.parse(row.document) as NewsDocument : defaultNewsDocument();
    if (document.state.status === 'loading') { document.state.status = 'failed'; document.state.error = '上次新闻刷新已中断，可重新刷新'; }
    return document;
  }
  write(document: NewsDocument) {
    this.database.transaction(() => this.database.run(
      'INSERT INTO news_document (id, document) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document',
      [JSON.stringify(document)],
    ));
  }
}
