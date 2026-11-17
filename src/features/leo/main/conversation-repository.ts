import type { LeoConversation, ModelConfiguration } from '../../../shared/contracts/leo';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';

export type StoredModel = ModelConfiguration & { encryptedKey?: string; unauthorized?: boolean };
export type LeoDocument = { models: StoredModel[]; conversations: LeoConversation[]; revision: number };
export const leoMigrations: readonly Migration[] = [{
  id: 'leo', version: 1,
  up(database) { database.exec('CREATE TABLE IF NOT EXISTS leo_document (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL)'); },
}];

export class ConversationRepository {
  constructor(private readonly database: ProfileDatabase) {}
  read(): LeoDocument {
    const row = this.database.get<{ document: string }>('SELECT document FROM leo_document WHERE id = 1');
    return row ? JSON.parse(row.document) as LeoDocument : { models: [], conversations: [], revision: 0 };
  }
  write(document: LeoDocument) {
    this.database.transaction(() => this.database.run(
      'INSERT INTO leo_document (id, document) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document',
      [JSON.stringify(document)],
    ));
  }
}
