import { randomUUID } from 'node:crypto';
import type { ContentGrant } from '../../../shared/contracts/leo';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { extractArticleSource } from '../../page-tools/page/extract-article';

type GrantRecord = ContentGrant & { contextId: string; scope: 'article' | 'selection' };

export class ContentAccess {
  private readonly grants = new Map<string, GrantRecord>();
  private readonly releases: Array<() => void>;
  constructor(private readonly runtime: FeatureRuntime) {
    this.releases = [
      runtime.pages.register('leo.content.article', { world: 'isolated', source: extractArticleSource }),
      runtime.pages.register('leo.content.selection', { world: 'isolated', source: () => 'String(window.getSelection()?.toString() || "")' }),
      runtime.core.onEvent((event) => {
        for (const [id, grant] of this.grants) {
          if ((event.type === 'tabClosed' && event.tabId === grant.tabId) ||
              (event.type === 'navigationCommitted' && event.visit.tabId === grant.tabId && event.visit.navigationId !== grant.navigationId) ||
              (event.type === 'contextDisposed' && event.context.contextId === grant.contextId)) this.grants.delete(id);
        }
      }),
    ];
  }

  grant(context: CommandContext, tabId: string, scope: 'article' | 'selection'): ContentGrant {
    const tab = this.runtime.core.getTab(tabId);
    if (tab.windowId !== context.windowId || tab.contextId !== context.contextId) throw new BrowserError('FORBIDDEN', '不能授权其他窗口的页面');
    if (!/^https?:/.test(tab.url)) throw new BrowserError('FORBIDDEN', '此页面不能提供给模型');
    const record: GrantRecord = {
      id: randomUUID(), tabId, navigationId: tab.navigationId, origin: new URL(tab.url).origin,
      title: tab.title, expiresAt: Date.now() + 5 * 60 * 1000, contextId: context.contextId, scope,
    };
    this.grants.set(record.id, record);
    const { contextId: _context, scope: _scope, ...publicGrant } = record;
    return publicGrant;
  }

  revoke(context: CommandContext, grantId: string) {
    const grant = this.grants.get(grantId);
    if (grant && grant.contextId !== context.contextId) throw new BrowserError('FORBIDDEN', '页面授权不属于当前窗口');
    this.grants.delete(grantId);
  }

  async consume(context: CommandContext, grantId: string) {
    const grant = this.grants.get(grantId);
    if (!grant || grant.contextId !== context.contextId || grant.expiresAt <= Date.now()) {
      throw new BrowserError('FORBIDDEN', '页面授权已失效，请重新授权');
    }
    this.grants.delete(grantId);
    const tab = this.runtime.core.getTab(grant.tabId);
    if (tab.navigationId !== grant.navigationId || new URL(tab.url).origin !== grant.origin) {
      throw new BrowserError('FORBIDDEN', '页面已改变，请重新授权');
    }
    const target = { tabId: tab.id, navigationId: tab.navigationId, origin: grant.origin };
    const text = grant.scope === 'selection' ?
      await this.runtime.pages.execute<string>('leo.content.selection', target, {}) :
      (await this.runtime.pages.execute<{ textContent: string } | null>('leo.content.article', target, {}))?.textContent;
    if (!text?.trim()) throw new BrowserError('UNAVAILABLE', grant.scope === 'selection' ? '页面没有选中文字' : '未找到可授权的文章正文');
    if (this.runtime.core.getTab(tab.id).navigationId !== grant.navigationId) throw new BrowserError('CANCELLED', '页面已改变，授权已撤销');
    return { title: grant.title, origin: grant.origin, text: text.trim(), navigationId: grant.navigationId, tabId: grant.tabId };
  }

  dispose() { this.releases.forEach((release) => release()); this.grants.clear(); }
}
