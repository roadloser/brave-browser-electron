import { session, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '../../shared/contracts/browser-core';
import { BrowserError } from '../../shared/errors';
import { PageEventSource } from './page-event-source';

type SessionEntry = { context: BrowserContext; session: Session; references: number };

export class SessionRegistry {
  private readonly entries = new Map<string, SessionEntry>();

  constructor(private readonly events: PageEventSource) {}

  acquire(profileId: string, isPrivate: boolean): BrowserContext {
    const existing = [...this.entries.values()].find(entry => entry.context.profileId === profileId && entry.context.isPrivate === isPrivate);
    if (existing) {
      existing.references += 1;
      return { ...existing.context };
    }
    const contextId = isPrivate ? 'private-' + randomUUID() : 'profile-' + profileId;
    const context: BrowserContext = { profileId, contextId, isPrivate };
    const partition = isPrivate ? 'private:' + contextId : 'persist:profile-' + profileId;
    const browserSession = session.fromPartition(partition, { cache: !isPrivate });
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    this.entries.set(contextId, { context, session: browserSession, references: 1 });
    this.events.emit({ type: 'sessionCreated', context: { ...context } });
    return context;
  }

  get(context: BrowserContext): Session {
    const entry = this.entries.get(context.contextId);
    if (!entry || entry.context.profileId !== context.profileId || entry.context.isPrivate !== context.isPrivate) {
      throw new BrowserError('NOT_FOUND', '浏览器会话已结束');
    }
    return entry.session;
  }

  contexts(): BrowserContext[] {
    return [...this.entries.values()].map(entry => ({ ...entry.context }));
  }

  async release(context: BrowserContext): Promise<void> {
    const entry = this.entries.get(context.contextId);
    if (!entry) return;
    entry.references -= 1;
    if (entry.references > 0) return;
    this.entries.delete(context.contextId);
    if (context.isPrivate) {
      await entry.session.closeAllConnections();
      await entry.session.clearStorageData();
      await entry.session.clearCache();
    }
    this.events.emit({ type: 'contextDisposed', context: { ...context } });
  }

  async dispose(): Promise<void> {
    for (const entry of [...this.entries.values()]) {
      entry.references = 1;
      await this.release(entry.context);
    }
  }
}
