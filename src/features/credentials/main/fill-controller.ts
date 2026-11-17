import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { captureForm, fillForm } from '../page/form-agent';

export class FillController {
  private readonly disposers: Array<() => void>;
  constructor(private readonly runtime: FeatureRuntime) {
    this.disposers = [
      runtime.pages.register('credentials.capture', { world: 'isolated', source: () => '(' + captureForm.toString() + ')()' }),
      runtime.pages.register('credentials.fill', { world: 'isolated', source: input => '(' + fillForm.toString() + ')(' + JSON.stringify(input) + ')' }),
    ];
  }
  async capture(context: CommandContext, tabId: string) {
    const target = this.target(context, tabId);
    const value = await this.runtime.pages.execute<{ username: string; password: string } | null>('credentials.capture', target, null);
    if (!value?.password || value.password.length > 16384 || value.username.length > 2048) throw new BrowserError('NOT_FOUND', '当前页面未找到可保存的登录表单');
    return { ...value, origin: target.origin };
  }
  async fill(context: CommandContext, tabId: string, origin: string, username: string, password: string) {
    const target = this.target(context, tabId);
    if (target.origin !== origin) throw new BrowserError('FORBIDDEN', '此密码只允许填入保存时的网站来源');
    const filled = await this.runtime.pages.execute<boolean>('credentials.fill', target, { username, password });
    if (!filled) throw new BrowserError('NOT_FOUND', '当前页面未找到可填写的登录表单');
    return { filled };
  }
  dispose(): void { this.disposers.forEach(dispose => dispose()); }
  private target(context: CommandContext, tabId: string) {
    const tab = this.runtime.core.getTab(tabId);
    if (tab.windowId !== context.windowId) throw new BrowserError('FORBIDDEN', '不能读取其他窗口的登录表单');
    const url = new URL(tab.url);
    if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && url.hostname !== 'localhost')) {
      throw new BrowserError('FORBIDDEN', '只能在安全网站或 localhost 使用密码填写');
    }
    return { tabId, origin: url.origin, navigationId: tab.navigationId };
  }
}
