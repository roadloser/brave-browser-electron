import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CommandContext, FeatureRuntime } from '../../../../shared/module-lifecycle';
import type { VpnAccountState } from '../../../../shared/contracts/vpn-account';
import { BrowserError } from '../../../../shared/errors';
import { VpnAccountWindow } from './account-window';
import { VpnAccountStates } from './account-state';
import { SkuRepository } from './repository';
import { VpnSkuClient } from './sku-client';
import { accountOrigin, vpnSkuDomain } from './types';
import type { VpnRepository } from '../repository';
import type { VpnProviderPort } from '../provider-port';

type Login = { epoch: string; context: CommandContext; window: VpnAccountWindow; controller: AbortController; queue: Promise<unknown>; retired: boolean };
const requestSchema = z.object({ method: z.enum(['refresh_order', 'fetch_order_credentials', 'credential_summary', 'prepare_credentials_presentation']), arguments: z.array(z.string().min(1).max(256)).min(1).max(2) }).strict();

export class VpnAccountManager {
  private readonly logins = new Map<string, Login>();
  private readonly refreshes = new Map<string, AbortController>();
  private readonly skus: SkuRepository;
  private readonly client: VpnSkuClient;
  private readonly states: VpnAccountStates;
  private disposed = false;
  constructor(private readonly runtime: FeatureRuntime, private readonly repository: VpnRepository, private readonly provider: VpnProviderPort,
    private readonly beforeChange: (profileId: string) => Promise<void>, private readonly changed: (profileId: string) => void) {
    this.skus = new SkuRepository(runtime.storage, runtime.secrets);
    this.client = new VpnSkuClient(runtime.network, this.skus);
    this.states = new VpnAccountStates(runtime, repository);
    ipcMain.handle('brave:vpn-account', (event, raw: unknown) => this.dispatch(event, raw));
  }
  get(profileId: string): VpnAccountState { return this.states.get(profileId); }
  async login(context: CommandContext): Promise<VpnAccountState> {
    this.regular(context);
    await this.beforeChange(context.profileId);
    this.retire(context.profileId);
    const controller = new AbortController();
    const window = new VpnAccountWindow(context.profileId, this.runtime.assets.vpnAccountPreloadPath, this.runtime.core.getNativeWindow(context.windowId),
      () => { this.retire(context.profileId); this.states.patch(context.profileId, { phase: 'expired', loginOpen: false, summary: '登录已超时，请重新开始' }); },
      () => { this.retire(context.profileId); this.states.patch(context.profileId, { phase: 'cancelled', loginOpen: false, summary: '账户登录已关闭' }); });
    const login: Login = { epoch: randomUUID(), context, window, controller, queue: Promise.resolve(), retired: false };
    this.logins.set(context.profileId, login);
    this.states.patch(context.profileId, { phase: 'opening', summary: '正在打开官方账户', loginOpen: true, error: undefined });
    try {
      await window.open();
      if (!login.retired) return this.states.patch(context.profileId, { phase: 'waiting', summary: '请在官方账户页登录并激活VPN', loginOpen: true });
      return this.get(context.profileId);
    } catch (error) { this.retire(context.profileId); return this.failed(context.profileId, error); }
  }
  async refresh(context: CommandContext): Promise<VpnAccountState> {
    this.regular(context);
    if (this.refreshes.has(context.profileId)) throw new BrowserError('CONFLICT', '账户授权正在刷新');
    const controller = new AbortController();
    this.refreshes.set(context.profileId, controller);
    this.states.patch(context.profileId, { phase: 'authorizing', summary: '正在刷新VPN账户授权', error: undefined });
    try { await this.authorize(context, controller.signal); return this.get(context.profileId); }
    catch (error) { return this.failed(context.profileId, error); }
    finally { this.refreshes.delete(context.profileId); }
  }
  async ensure(context: CommandContext): Promise<void> {
    const expiration = this.repository.expiration(context.profileId);
    if (expiration !== null && expiration > Date.now() && this.repository.get(context.profileId).credential) return;
    const state = await this.refresh(context);
    if (state.phase !== 'authorized') throw new BrowserError('FORBIDDEN', state.summary);
  }
  cancel(profileId: string): VpnAccountState {
    this.retire(profileId);
    this.refreshes.get(profileId)?.abort();
    return this.states.patch(profileId, { phase: 'cancelled', summary: '账户授权操作已取消', loginOpen: false });
  }
  async signOut(context: CommandContext): Promise<VpnAccountState> {
    this.regular(context);
    await this.beforeChange(context.profileId);
    this.cancel(context.profileId);
    this.repository.forget(context.profileId);
    this.skus.clear(context.profileId);
    await VpnAccountWindow.clear(context.profileId);
    this.changed(context.profileId);
    return this.states.patch(context.profileId, { phase: 'signed-out', summary: '本应用账户已退出；付费订阅仍由官方账户管理', expiresAt: null, loginOpen: false, error: undefined });
  }
  dispose(): void {
    this.disposed = true;
    ipcMain.removeHandler('brave:vpn-account');
    for (const profileId of [...this.logins.keys()]) this.retire(profileId);
    for (const controller of this.refreshes.values()) controller.abort();
    this.refreshes.clear();
  }
  private async dispatch(event: IpcMainInvokeEvent, raw: unknown): Promise<{ ok: boolean; value?: unknown; error?: string }> {
    try {
      const request = requestSchema.parse(raw);
      const login = [...this.logins.values()].find(value => !value.window.window.isDestroyed() && value.window.window.webContents.id === event.sender.id);
      if (!login || login.retired || event.senderFrame !== event.sender.mainFrame || new URL(event.senderFrame.url).origin !== accountOrigin) throw new BrowserError('FORBIDDEN', '此页面不能访问VPN账户授权');
      const frame = event.senderFrame;
      const valid = () => !this.disposed && !login.retired && !frame.isDestroyed() && event.senderFrame === event.sender.mainFrame && new URL(frame.url).origin === accountOrigin;
      const operation = login.queue.then(async () => {
        if (!valid()) throw new BrowserError('CANCELLED', '账户页面已改变');
        const [first, second] = request.arguments;
        let value: unknown;
        if (request.method === 'refresh_order') value = await this.client.refreshOrder(login.context, first, login.controller.signal);
        else if (request.method === 'fetch_order_credentials') value = await this.client.fetchOrderCredentials(login.context, first, login.controller.signal);
        else if (request.method === 'prepare_credentials_presentation') value = this.client.present(login.context.profileId, first, second ?? '/').cookie;
        else {
          const summary = await this.client.summary(login.context, first, login.controller.signal);
          if (summary?.active && summary.remaining_credential_count > 0 && valid()) await this.authorize(login.context, login.controller.signal, valid);
          else if (valid()) this.states.patch(login.context.profileId, { phase: 'waiting', summary: '请在官方账户页激活有效VPN订阅', loginOpen: true });
          value = summary ?? {};
        }
        if (!valid()) throw new BrowserError('CANCELLED', '账户页面已改变，响应已取消');
        return value;
      });
      login.queue = operation.catch(() => undefined);
      return { ok: true, value: await operation };
    } catch (error) {
      return { ok: false, error: error instanceof BrowserError ? error.message : '账户授权请求未完成' };
    }
  }
  private async authorize(context: CommandContext, signal: AbortSignal, valid = () => !this.disposed): Promise<void> {
    const summary = await this.client.summary(context, vpnSkuDomain, signal);
    if (!summary?.active || summary.remaining_credential_count < 1) throw new BrowserError('FORBIDDEN', '没有有效VPN授权，请在官方账户页登录并激活');
    this.states.patch(context.profileId, { phase: 'authorizing', summary: '正在确认VPN订阅资格', error: undefined });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      signal.throwIfAborted();
      if (!valid()) throw new BrowserError('CANCELLED', '账户页面已改变');
      const presentation = this.client.present(context.profileId, vpnSkuDomain, '*');
      try {
        const credential = await this.provider.authorize(context, { kind: 'brave-premium', value: presentation.credential }, signal);
        signal.throwIfAborted();
        if (!valid()) throw new BrowserError('CANCELLED', '账户授权已取消');
        this.repository.credential(context.profileId, credential, presentation.expiresAt);
        this.changed(context.profileId);
        this.states.patch(context.profileId, { phase: 'authorized', summary: 'VPN账户授权成功，可以选择地区', expiresAt: presentation.expiresAt, loginOpen: this.logins.has(context.profileId), error: undefined });
        return;
      } catch (error) {
        if (attempt === 0 && error instanceof BrowserError && error.details?.guardianCode === 'TokenNoLongerValid') continue;
        throw error;
      }
    }
  }
  private retire(profileId: string): void {
    const login = this.logins.get(profileId);
    if (!login) return;
    login.retired = true;
    login.controller.abort();
    this.logins.delete(profileId);
    login.window.close();
  }
  private failed(profileId: string, error: unknown): VpnAccountState {
    const message = error instanceof BrowserError ? error.message : '账户授权未完成，请重试或重新登录';
    return this.states.patch(profileId, { phase: 'failed', summary: message, error: message, loginOpen: this.logins.has(profileId) });
  }
  private regular(context: CommandContext): void {
    if (this.disposed) throw new BrowserError('UNAVAILABLE', '账户服务已关闭');
    if (context.isPrivate || context.kind === 'tor') throw new BrowserError('FORBIDDEN', '请在普通窗口管理VPN账户');
    if (!this.runtime.secrets.available()) throw new BrowserError('UNAVAILABLE', '系统安全存储不可用，无法保存账户授权');
  }
}
