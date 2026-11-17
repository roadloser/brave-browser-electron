import type { OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails, Session } from 'electron';
import { NetworkPolicyCoordinator } from './request-policy';

export type RequestDecision = { cancel?: boolean; redirectURL?: string };
export type RequestEvaluator = (details: OnBeforeRequestListenerDetails) => RequestDecision | Promise<RequestDecision>;

export class ElectronRequestHost {
  constructor(private readonly policies: NetworkPolicyCoordinator) {}

  attach(browserSession: Session, evaluate: RequestEvaluator, onError: (error: unknown) => void): () => void {
    const release = this.policies.claimNative(browserSession);
    let disposed = false;
    browserSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      Promise.resolve().then(() => evaluate(details)).then(
        decision => callback(disposed ? { cancel: false } : decision),
        error => { onError(error); callback({ cancel: true }); },
      );
    });
    return () => {
      if (disposed) return;
      disposed = true;
      browserSession.webRequest.onBeforeRequest(null);
      release();
    };
  }

  attachHeaders(browserSession: Session, policy: (details: OnBeforeSendHeadersListenerDetails) => Record<string, string>): () => void {
    const release = this.policies.claimNative(browserSession, 'headers');
    browserSession.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      try { callback({ requestHeaders: policy(details) }); }
      catch { callback({ cancel: true }); }
    });
    return () => { browserSession.webRequest.onBeforeSendHeaders(null); release(); };
  }

  attachResponseHeaders(browserSession: Session, policy: (details: OnHeadersReceivedListenerDetails) => Record<string, string | string[]>): () => void {
    const release = this.policies.claimNative(browserSession, 'response-headers');
    browserSession.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      try { callback({ responseHeaders: policy(details) }); }
      catch { callback({ cancel: true }); }
    });
    return () => { browserSession.webRequest.onHeadersReceived(null); release(); };
  }
}
