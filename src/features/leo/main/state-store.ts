import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import { ConversationRepository, type LeoDocument } from './conversation-repository';

export class LeoStateStore {
  private readonly documents = new Map<string, LeoDocument>();
  constructor(private readonly runtime: FeatureRuntime) {}
  key(context: CommandContext) { return context.isPrivate ? `private:${context.contextId}` : `profile:${context.profileId}`; }
  has(context: CommandContext) { return this.documents.has(this.key(context)); }
  get(context: CommandContext): LeoDocument {
    const key = this.key(context);
    const existing = this.documents.get(key);
    if (existing) return existing;
    const persisted = new ConversationRepository(this.runtime.storage.open(context.profileId)).read();
    const document: LeoDocument = context.isPrivate ? { models: persisted.models, conversations: [], revision: persisted.revision } : persisted;
    let changed = false;
    document.conversations.forEach((conversation) => conversation.messages.forEach((message) => {
      if (message.status === 'streaming') { message.status = 'failed'; changed = true; }
    }));
    if (changed && !context.isPrivate) {
      document.revision++;
      new ConversationRepository(this.runtime.storage.open(context.profileId)).write(document);
    }
    this.documents.set(key, document);
    return document;
  }
  update(context: CommandContext, operation: (document: LeoDocument) => void) {
    const next = structuredClone(this.get(context));
    operation(next);
    next.revision++;
    if (!context.isPrivate) new ConversationRepository(this.runtime.storage.open(context.profileId)).write(next);
    this.documents.set(this.key(context), next);
    return next;
  }
  releaseContext(context: BrowserContext) { this.documents.delete(context.isPrivate ? `private:${context.contextId}` : `profile:${context.profileId}`); }
  dispose() { this.documents.clear(); }
}
