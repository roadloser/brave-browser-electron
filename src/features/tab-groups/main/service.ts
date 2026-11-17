import { randomUUID } from 'node:crypto';
import type { BrowserContext, CoreEvent, WindowSnapshot } from '../../../shared/contracts/browser-core';
import type { GroupColor, TabGroup, TabGroupsState } from '../../../shared/contracts/tab-groups';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { TabGroupRepository } from './repository';
import { contiguousOrder, normalizeGroups } from './group-order';

type WindowGroups = { context: BrowserContext; groups: TabGroup[]; revision: number; activeTabId: string | null };

export class TabGroupService {
  private readonly windows = new Map<string, WindowGroups>();
  private revision = 0;
  private changing = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly runtime: FeatureRuntime) {
    this.unsubscribe = runtime.core.onEvent((event) => this.onCoreEvent(event));
  }

  list(context: CommandContext): TabGroupsState {
    const state = this.load(context);
    return this.snapshot(state);
  }

  create(context: CommandContext, input: { name: string; color: GroupColor; tabIds: string[] }) {
    const window = this.runtime.core.getWindow(context.windowId);
    const tabIds = [...new Set(input.tabIds)];
    this.assertTabs(window, tabIds);
    return this.commit(context, (groups) => [
      ...groups.map((group) => ({ ...group, tabIds: group.tabIds.filter((tabId) => !tabIds.includes(tabId)) })),
      { id: randomUUID(), windowId: window.id, name: input.name.trim(), color: input.color,
        collapsed: false, tabIds, position: window.tabs.findIndex((tab) => tab.id === tabIds[0]), revision: 0 },
    ]);
  }

  update(context: CommandContext, input: { groupId: string; name?: string; color?: GroupColor; collapsed?: boolean }) {
    this.findGroup(context, input.groupId);
    return this.commit(context, (groups) => groups.map((group) => group.id === input.groupId ?
      { ...group, name: input.name?.trim() ?? group.name, color: input.color ?? group.color,
        collapsed: input.collapsed ?? group.collapsed } : group));
  }

  moveTab(context: CommandContext, input: { tabId: string; groupId: string | null; index?: number }) {
    const window = this.runtime.core.getWindow(context.windowId);
    this.assertTabs(window, [input.tabId]);
    if (input.groupId) this.findGroup(context, input.groupId);
    return this.commit(context, (groups) => {
      const without = groups.map((group) => ({ ...group, tabIds: group.tabIds.filter((tabId) => tabId !== input.tabId) }));
      if (input.groupId) {
        const target = without.find((group) => group.id === input.groupId)!;
        const insertion = input.index === undefined ? target.tabIds.length :
          target.tabIds.filter((tabId) => window.tabs.findIndex((tab) => tab.id === tabId) < input.index!).length;
        target.tabIds.splice(insertion, 0, input.tabId);
      }
      return without;
    }, input.groupId ? undefined : { tabId: input.tabId, index: input.index });
  }

  ungroup(context: CommandContext, groupId: string) {
    this.findGroup(context, groupId);
    return this.commit(context, (groups) => groups.filter((group) => group.id !== groupId));
  }

  close(context: CommandContext, groupId: string) {
    const closing = this.findGroup(context, groupId);
    const state = this.load(context);
    const previous = structuredClone(state.groups);
    this.commit(context, (groups) => groups.filter((group) => group.id !== groupId));
    this.changing = true;
    try {
      for (const tabId of closing.tabIds) this.runtime.core.closeTab(tabId);
    } catch (error) {
      const window = this.runtime.core.getWindow(context.windowId);
      const remaining = normalizeGroups(previous, window);
      this.save(context, remaining);
      state.groups = remaining;
      this.publish(context.windowId, state);
      throw error;
    } finally {
      this.changing = false;
    }
    return this.snapshot(state);
  }

  dispose() {
    this.unsubscribe();
    this.windows.clear();
  }

  private load(context: CommandContext): WindowGroups {
    const existing = this.windows.get(context.windowId);
    if (existing) return existing;
    const window = this.runtime.core.getWindow(context.windowId);
    const persisted = context.isPrivate ? [] : this.repository(context.profileId).list(window.id);
    const groups = normalizeGroups(persisted, window);
    this.revision = Math.max(this.revision, ...groups.map((group) => group.revision), 0);
    const state = { context, groups, revision: this.revision, activeTabId: window.activeTabId };
    this.windows.set(window.id, state);
    return state;
  }

  private findGroup(context: CommandContext, groupId: string) {
    const group = this.load(context).groups.find((entry) => entry.id === groupId);
    if (!group) throw new BrowserError('NOT_FOUND', '标签组已不存在');
    return group;
  }

  private assertTabs(window: WindowSnapshot, tabIds: string[]) {
    for (const tabId of tabIds) {
      const tab = window.tabs.find((entry) => entry.id === tabId);
      if (!tab) throw new BrowserError('FORBIDDEN', '不能移动其他窗口的标签页');
      if (tab.pinned) throw new BrowserError('CONFLICT', '请先取消固定，再添加到标签组');
    }
  }

  private commit(
    context: CommandContext,
    operation: (groups: TabGroup[]) => TabGroup[],
    move?: { tabId: string; index?: number },
  ): TabGroupsState {
    const state = this.load(context);
    const previous = structuredClone(state.groups);
    const window = this.runtime.core.getWindow(context.windowId);
    const originalOrder = window.tabs.map((tab) => tab.id);
    const candidate = operation(structuredClone(previous)).filter((group) => group.tabIds.length);
    const nextRevision = ++this.revision;
    candidate.forEach((group) => { group.revision = nextRevision; });
    this.save(context, candidate);
    this.changing = true;
    try {
      if (move && move.index !== undefined) this.runtime.core.moveTab(move.tabId, move.index);
      const ordered = contiguousOrder(candidate, this.runtime.core.getWindow(context.windowId));
      ordered.forEach((tabId, index) => this.runtime.core.moveTab(tabId, index));
      state.groups = normalizeGroups(candidate, this.runtime.core.getWindow(context.windowId));
      this.save(context, state.groups);
      state.revision = nextRevision;
    } catch (error) {
      state.groups = previous;
      this.save(context, previous);
      originalOrder.forEach((tabId, index) => this.runtime.core.moveTab(tabId, index));
      throw error;
    } finally {
      this.changing = false;
    }
    this.runtime.publish('tabGroups.changed', this.snapshot(state), { windowId: context.windowId });
    return this.snapshot(state);
  }

  private save(context: BrowserContext & { windowId: string }, groups: TabGroup[]) {
    if (!context.isPrivate) this.repository(context.profileId).replace(context.windowId, groups);
  }

  private repository(profileId: string) {
    return new TabGroupRepository(this.runtime.storage.open(profileId));
  }

  private snapshot(state: WindowGroups): TabGroupsState {
    return { groups: structuredClone(state.groups), revision: state.revision };
  }

  private publish(windowId: string, state: WindowGroups) {
    state.revision = ++this.revision;
    state.groups.forEach((group) => { group.revision = state.revision; });
    this.runtime.publish('tabGroups.changed', this.snapshot(state), { windowId });
  }

  private onCoreEvent(event: CoreEvent) {
    if (event.type === 'contextDisposed') {
      for (const [windowId, state] of this.windows) {
        if (state.context.contextId === event.context.contextId) this.windows.delete(windowId);
      }
      return;
    }
    if (this.changing || event.type !== 'stateChanged') return;
    for (const window of event.state.windows) {
      const state = this.windows.get(window.id);
      if (!state) continue;
      const activeChanged = state.activeTabId !== window.activeTabId;
      state.activeTabId = window.activeTabId;
      const groups = normalizeGroups(state.groups, window).map((group) =>
        activeChanged && group.collapsed && window.activeTabId && group.tabIds.includes(window.activeTabId) ?
          { ...group, collapsed: false } : group);
      if (JSON.stringify(groups) === JSON.stringify(state.groups)) continue;
      try {
        this.save({ ...state.context, windowId: window.id }, groups);
        state.groups = groups;
        this.publish(window.id, state);
      } catch {
        this.runtime.publish('app.error', {
          code: 'STORAGE_FAILED', message: '标签组状态保存失败，请重试', recoverable: true,
        }, { windowId: window.id });
      }
    }
  }
}
