import type { CommandContext, FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { OAuthSession } from './provider-types';
import { oauthCallback, oauthUrl } from './oauth-url';
import { BrowserError } from '../../../../shared/errors';

export class RewardsOAuthTab {
  constructor(private readonly runtime: FeatureRuntime) {}
  async authorize(context: CommandContext, session: OAuthSession, signal: AbortSignal): Promise<string> {
    const tab = await this.runtime.core.openTab({ windowId: context.windowId, url: 'about:blank', active: true });
    if (signal.aborted) throw new BrowserError('CANCELLED', '账户授权已取消');
    const contents = this.runtime.core.getTabWebContents(tab.id);
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (code?: string, problem?: Error) => {
        if (settled) return;
        settled = true; cleanup();
        if (!contents.isDestroyed()) contents.stop();
        if (problem) reject(problem); else resolve(code!);
      };
      const navigate = (event: Electron.Event, target: string) => {
        if (!target.startsWith('rewards:')) return;
        event.preventDefault();
        try {
          const current = this.runtime.core.getTab(tab.id);
          if (current.contextId !== context.contextId || current.profileId !== context.profileId) throw new BrowserError('FORBIDDEN', '账户授权资料已改变', false);
          const code = oauthCallback(session, target, contents.getURL());
          if (code) finish(code);
        } catch (error) { finish(undefined, error instanceof Error ? error : new Error('账户回调无效')); }
      };
      const redirected = (event: Electron.Event, target: string, _inPlace: boolean, isMainFrame: boolean) => { if (isMainFrame) navigate(event, target); };
      const aborted = () => finish(undefined, new BrowserError('CANCELLED', '账户授权已取消或超时'));
      const destroyed = () => finish(undefined, new BrowserError('CANCELLED', '账户授权标签已关闭'));
      const timer = setTimeout(aborted, 10 * 60_000);
      const cleanup = () => {
        clearTimeout(timer); signal.removeEventListener('abort', aborted);
        contents.removeListener('will-navigate', navigate); contents.removeListener('will-redirect', redirected); contents.removeListener('destroyed', destroyed);
      };
      contents.on('will-navigate', navigate); contents.on('will-redirect', redirected); contents.once('destroyed', destroyed);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) return aborted();
      void this.runtime.core.navigate(tab.id, oauthUrl(session)).catch(error => { if (!settled) finish(undefined, error instanceof Error ? error : new Error('官方授权页面打开失败')); });
    });
  }
}
