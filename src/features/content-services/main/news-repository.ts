import type { NewsState } from '../../../shared/contracts/content-services';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';
import type { ScoredArticle, ScopedPublisher } from './providers/provider';
import type { NewsTopic, SimilarityMatrix } from './providers/topics-provider';

export type NewsDocument = {
  state: NewsState; catalog: ScopedPublisher[]; candidates: ScoredArticle[];
  topics: NewsTopic[]; similarities: SimilarityMatrix; enrichmentLocale?: string;
};
export const contentMigrations: readonly Migration[] = [{
  id: 'content-services', version: 1,
  up(database) { database.exec('CREATE TABLE IF NOT EXISTS news_document (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL)'); },
}, {
  id: 'content-services', version: 2,
  up(database) {
    const row = database.get<{ document: string }>('SELECT document FROM news_document WHERE id = 1');
    if (!row) return;
    const document = JSON.parse(row.document) as NewsDocument;
    document.topics ??= []; document.similarities ??= {};
    document.state.feed ??= document.state.articles.map((article) => ({ id: article.id, kind: 'article', articleId: article.id, discover: false }));
    document.state.topicsStatus ??= 'idle';
    database.run('UPDATE news_document SET document = ? WHERE id = 1', [JSON.stringify(document)]);
  },
}];
export function defaultNewsDocument(): NewsDocument {
  return {
    state: { enabled: false, locale: 'en-US', publishers: [], enabledPublisherIds: [], disabledPublisherIds: [],
      channels: [], directFeeds: [], articles: [], feed: [], topicsStatus: 'idle', lastUpdated: null, status: 'idle', revision: 0 },
    catalog: [], candidates: [], topics: [], similarities: {},
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
