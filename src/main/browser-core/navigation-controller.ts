import { randomUUID } from 'node:crypto';
import type { NavigationCommitted } from '../../shared/contracts/browser-core';
import type { TabRecord } from './core-state';
import { logicalUrl, nativeUrl, normalizeNavigation, isInternalPage } from './internal-pages';

export class NavigationController {
  constructor(
    private readonly changed: (tab: TabRecord) => void,
    private readonly committed: (visit: NavigationCommitted) => void,
    private readonly searchEngine: (profileId: string) => string,
  ) {}

  bind(tab: TabRecord): () => void {
    const contents = tab.view.webContents;
    const update = () => {
      if (contents.isDestroyed()) return;
      tab.snapshot.loading = contents.isLoading();
      tab.snapshot.canGoBack = contents.navigationHistory.canGoBack();
      tab.snapshot.canGoForward = contents.navigationHistory.canGoForward();
      tab.snapshot.audible = contents.isCurrentlyAudible();
      tab.snapshot.muted = contents.isAudioMuted();
      tab.snapshot.revision += 1;
      this.changed(tab);
    };
    const commit = (url: string, sameDocument: boolean) => {
      tab.snapshot.url = logicalUrl(url);
      tab.snapshot.navigationId = randomUUID();
      tab.snapshot.error = undefined;
      tab.snapshot.crashed = false;
      update();
      if (isInternalPage(tab.snapshot.url)) return;
      this.committed({
        profileId: tab.snapshot.profileId, contextId: tab.snapshot.contextId,
        isPrivate: tab.snapshot.isPrivate, windowId: tab.snapshot.windowId,
        tabId: tab.snapshot.id, url: tab.snapshot.url, title: contents.getTitle(),
        navigationId: tab.snapshot.navigationId, revision: tab.snapshot.revision,
        timestamp: Date.now(), source: sameDocument ? 'same-document' : tab.source,
      });
      tab.source = 'navigation';
    };
    const navigated = (_event: Electron.Event, url: string) => commit(url, false);
    const inPage = (_event: Electron.Event, url: string, isMainFrame: boolean) => { if (isMainFrame) commit(url, true); };
    const title = (_event: Electron.Event, value: string) => { tab.snapshot.title = value || tab.snapshot.url; update(); };
    const favicon = (_event: Electron.Event, urls: string[]) => { tab.snapshot.faviconUrl = urls.find(url => /^https?:/.test(url)); update(); };
    const failed = (_event: Electron.Event, code: number, description: string, _url: string, isMainFrame: boolean) => {
      if (!isMainFrame || code === -3) return;
      tab.snapshot.error = description;
      update();
    };
    const gone = () => { tab.snapshot.crashed = true; tab.snapshot.loading = false; update(); };
    const willNavigate = (event: Electron.Event, url: string) => {
      if (!/^https?:/i.test(url) && url !== 'about:blank' && !tab.allowedFiles.has(url)) event.preventDefault();
    };
    contents.on('did-navigate', navigated);
    contents.on('did-navigate-in-page', inPage);
    contents.on('page-title-updated', title);
    contents.on('page-favicon-updated', favicon);
    contents.on('did-fail-load', failed);
    contents.on('render-process-gone', gone);
    contents.on('will-navigate', willNavigate);
    for (const event of ['did-start-loading', 'did-stop-loading', 'media-started-playing', 'media-paused'] as const) contents.on(event, update);
    return () => {
      contents.removeListener('did-navigate', navigated);
      contents.removeListener('did-navigate-in-page', inPage);
      contents.removeListener('page-title-updated', title);
      contents.removeListener('page-favicon-updated', favicon);
      contents.removeListener('did-fail-load', failed);
      contents.removeListener('render-process-gone', gone);
      contents.removeListener('will-navigate', willNavigate);
      for (const event of ['did-start-loading', 'did-stop-loading', 'media-started-playing', 'media-paused'] as const) contents.removeListener(event, update);
    };
  }

  async navigate(tab: TabRecord, input: string): Promise<void> {
    const url = normalizeNavigation(input, this.searchEngine(tab.snapshot.profileId));
    tab.source = 'navigation';
    tab.snapshot.url = url;
    tab.snapshot.error = undefined;
    tab.snapshot.title = isInternalPage(url) ? (url === 'brave://newtab' ? '新标签页' : url) : url;
    this.changed(tab);
    try { await tab.view.webContents.loadURL(nativeUrl(url)); }
    catch (error) {
      if (error instanceof Error && error.message.includes('ERR_ABORTED')) return;
      tab.snapshot.error = error instanceof Error ? error.message : '页面加载失败';
      this.changed(tab);
      throw error;
    }
  }

  async openLocalFile(tab: TabRecord, url: string): Promise<void> {
    tab.allowedFiles.add(url);
    tab.snapshot.url = url;
    tab.snapshot.title = decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '本地文件');
    tab.snapshot.error = undefined;
    this.changed(tab);
    await tab.view.webContents.loadURL(url);
  }
}
