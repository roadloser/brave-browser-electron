import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { randomUUID } from 'node:crypto';

type SubmittedValue = { origin: string; username: string; password: string; url: string; capturedAt: number; documentToken: string };
export class SubmitCapture {
  private readonly registrations = new Map<string, () => void>();
  private readonly disposeCore: () => void;
  private readonly documents = new Map<string, { token: string; tabId: string; navigationId: string }>();

  constructor(private readonly runtime: FeatureRuntime, private readonly accept: (context: CommandContext, tabId: string, value: SubmittedValue) => void) {
    ipcMain.on('brave:credentials:submitted', this.received);
    ipcMain.on('brave:credentials:document', this.registerDocument);
    this.disposeCore = runtime.core.onEvent(event => {
      if (event.type === 'sessionCreated') this.attach(event.context);
      if (event.type === 'contextDisposed') {
        this.registrations.get(event.context.contextId)?.(); this.registrations.delete(event.context.contextId);
      }
      if (event.type === 'navigationCommitted' || event.type === 'tabClosed') {
        const tabId = event.type === 'tabClosed' ? event.tabId : event.visit.tabId;
        for (const [key, value] of this.documents) if (value.tabId === tabId) this.documents.delete(key);
      }
    });
    for (const context of runtime.core.getContexts()) this.attach(context);
  }
  dispose(): void {
    this.disposeCore(); ipcMain.removeListener('brave:credentials:submitted', this.received);
    ipcMain.removeListener('brave:credentials:document', this.registerDocument);
    for (const dispose of this.registrations.values()) dispose();
    this.registrations.clear();
    this.documents.clear();
  }
  private attach(context: BrowserContext): void {
    if (context.isPrivate || this.registrations.has(context.contextId)) return;
    const browserSession = this.runtime.core.sessionForContext(context);
    const id = browserSession.registerPreloadScript({ type: 'frame', filePath: this.runtime.assets.credentialPreloadPath });
    this.registrations.set(context.contextId, () => browserSession.unregisterPreloadScript(id));
  }
  private received = (event: IpcMainEvent, value: unknown): void => {
    const frame = event.senderFrame;
    if (!frame || frame.isDestroyed() || !value || typeof value !== 'object') return;
    const input = value as Partial<SubmittedValue>;
    if (typeof input.username !== 'string' || typeof input.password !== 'string' || typeof input.url !== 'string' || typeof input.origin !== 'string' || typeof input.capturedAt !== 'number') return;
    if (!input.password || input.password.length > 16384 || input.username.length > 2048 || Math.abs(Date.now() - input.capturedAt) > 5000) return;
    let source: URL;
    try { source = new URL(frame.url); } catch { return; }
    if (source.origin !== input.origin || frame.url !== input.url || (source.protocol !== 'https:' && source.hostname !== 'localhost')) return;
    if (!event.sender.mainFrame.framesInSubtree.includes(frame)) return;
    const document = this.documents.get(frame.processId + ':' + frame.routingId);
    if (!document || document.token !== input.documentToken) return;
    for (const native of BrowserWindow.getAllWindows()) {
      const window = this.runtime.core.getWindowForSender(native.webContents.id);
      if (!window || window.isPrivate) continue;
      const tab = window.tabs.find(candidate => this.runtime.core.getTabWebContents(candidate.id).id === event.sender.id);
      if (!tab) continue;
      if (tab.id !== document.tabId || tab.navigationId !== document.navigationId) return;
      try {
        this.accept({ ...window, windowId: window.id, requestId: randomUUID() }, tab.id, input as SubmittedValue);
      } catch { return; }
      return;
    }
  };
  private registerDocument = (event: IpcMainEvent): void => {
    const frame = event.senderFrame;
    if (!frame || frame.isDestroyed() || !event.sender.mainFrame.framesInSubtree.includes(frame)) return;
    for (const native of BrowserWindow.getAllWindows()) {
      const window = this.runtime.core.getWindowForSender(native.webContents.id);
      if (!window || window.isPrivate) continue;
      const tab = window.tabs.find(candidate => this.runtime.core.getTabWebContents(candidate.id).id === event.sender.id);
      if (!tab) continue;
      const token = randomUUID();
      this.documents.set(frame.processId + ':' + frame.routingId, { token, tabId: tab.id, navigationId: tab.navigationId });
      frame.send('brave:credentials:document-token', token);
      return;
    }
  };
}
