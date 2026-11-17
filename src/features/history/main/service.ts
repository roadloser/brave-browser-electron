import type { NavigationCommitted, TabSnapshot } from '../../../shared/contracts/browser-core';
import type { CommandPayload } from '../../../shared/contracts/envelope';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { HistoryRepository } from './repository';

export class HistoryService {
  private readonly localListeners = new Set<(profileId: string) => void>();
  constructor(private readonly runtime: FeatureRuntime) {}

  subscribeLocal(listener: (profileId: string) => void) {
    this.localListeners.add(listener);
    return () => { this.localListeners.delete(listener); };
  }

  notifyImported(profileId: string): void {
    this.runtime.publish('history.changed', { revision: this.repository(profileId).revision() }, { profileId });
  }

  record(visit: NavigationCommitted): void {
    if (visit.isPrivate || !this.recordable(visit.url)) return;
    const repository = this.repository(visit.profileId);
    if (repository.record(visit)) this.changed(visit.profileId, repository.revision());
  }

  updateTitle(tab: TabSnapshot): void {
    if (tab.isPrivate || !this.recordable(tab.url)) return;
    const repository = this.repository(tab.profileId);
    if (repository.updateTitle(tab.contextId, tab.navigationId, tab.title)) this.changed(tab.profileId, repository.revision());
  }

  query(context: CommandContext, input: CommandPayload<'history.query'>) {
    this.assertRegular(context);
    this.assertRange(input);
    return this.repository(context.profileId).query(input);
  }

  remove(context: CommandContext, ids: string[]) {
    this.assertRegular(context);
    const result = this.repository(context.profileId).remove(ids);
    if (result.removed) this.changed(context.profileId, result.revision);
    return result;
  }

  clear(context: CommandContext, input: CommandPayload<'history.clear'>) {
    this.assertRegular(context);
    this.assertRange(input);
    const result = this.repository(context.profileId).clear(input);
    if (result.removed) this.changed(context.profileId, result.revision);
    return result;
  }

  private changed(profileId: string, revision: number): void {
    this.runtime.publish('history.changed', { revision }, { profileId });
    for (const listener of this.localListeners) listener(profileId);
  }

  private repository(profileId: string): HistoryRepository {
    return new HistoryRepository(this.runtime.storage.open(profileId));
  }

  private assertRegular(context: CommandContext): void {
    if (context.isPrivate) throw new BrowserError('FORBIDDEN', '私密窗口不记录历史，请在普通窗口中管理已有历史');
  }

  private assertRange(input: { from?: number; to?: number }): void {
    if (input.from !== undefined && input.to !== undefined && input.from >= input.to) {
      throw new BrowserError('INVALID_ARGUMENT', '开始时间必须早于结束时间');
    }
  }

  private recordable(input: string): boolean {
    try { return ['https:', 'http:'].includes(new URL(input).protocol); } catch { return false; }
  }
}
