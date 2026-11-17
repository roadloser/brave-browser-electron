import type { OnBeforeRequestListenerDetails, Session } from 'electron';
import { NetworkPolicyCoordinator } from './request-policy';

export type RequestDecision = { cancel?: boolean; redirectURL?: string };
export type RequestEvaluator = (details: OnBeforeRequestListenerDetails) => RequestDecision | Promise<RequestDecision>;

export class ElectronRequestHost {
  constructor(private readonly policies: NetworkPolicyCoordinator) {}

  attach(browserSession: Session, evaluate: RequestEvaluator, onError: (error: unknown) => void): () => void {
    const release = this.policies.claimNative(browserSession);
    let disposed = false;
    browserSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
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
}
