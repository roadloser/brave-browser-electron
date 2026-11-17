import { ipcMain, type IpcMainInvokeEvent, type Session } from 'electron';
import { z } from 'zod';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import type { WalletService } from './wallet-service';
import { rpc } from './chains/network-client';

const channel = 'brave:wallet-provider';
const providerSchema = z.object({
  chain: z.enum(['ethereum', 'solana']),
  method: z.string().min(1).max(128),
  params: z.array(z.unknown()).max(20).default([]),
}).strict();
const ethereumReadMethods = new Set(['eth_blockNumber', 'eth_getBalance', 'eth_getTransactionCount', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_getTransactionReceipt', 'eth_getCode', 'eth_getBlockByNumber']);

export class ProviderRouter {
  private readonly tabsByContents = new Map<number, string>();
  private readonly preloads = new Map<Session, string>();
  private readonly release: () => void;
  constructor(private readonly runtime: FeatureRuntime, private readonly wallet: WalletService) {
    this.release = runtime.core.onEvent((event) => {
      if (event.type === 'sessionCreated') this.installSession(runtime.core.sessionForContext(event.context));
      if (event.type === 'stateChanged') {
        const windows = new Set(event.state.windows.map((window) => window.id));
        for (const [contents, tabId] of this.tabsByContents) {
          try { if (windows.has(runtime.core.getTab(tabId).windowId)) this.tabsByContents.delete(contents); }
          catch { this.tabsByContents.delete(contents); }
        }
        for (const window of event.state.windows) for (const tab of window.tabs) {
          try { this.tabsByContents.set(runtime.core.getTabWebContents(tab.id).id, tab.id); } catch {}
        }
      }
      if (event.type === 'tabClosed') for (const [contents, tabId] of this.tabsByContents) if (tabId === event.tabId) this.tabsByContents.delete(contents);
      if (event.type === 'contextDisposed') for (const [contents, tabId] of this.tabsByContents) {
        try { if (runtime.core.getTab(tabId).contextId === event.context.contextId) this.tabsByContents.delete(contents); }
        catch { this.tabsByContents.delete(contents); }
      }
    });
    for (const context of runtime.core.getContexts()) this.installSession(runtime.core.sessionForContext(context));
    ipcMain.handle(channel, async (event, raw: unknown) => {
      try {
        const payload = providerSchema.parse(raw);
        if (JSON.stringify(payload).length > 200000) throw new BrowserError('INVALID_ARGUMENT', '钱包请求过大');
        const { context, origin, tabId, navigationId } = this.sender(event);
        const value = await this.request(context, origin, tabId, payload);
        const current = runtime.core.getTab(tabId);
        if (current.navigationId !== navigationId || event.senderFrame.isDestroyed() || new URL(event.senderFrame.url).origin !== origin) {
          throw new BrowserError('CANCELLED', '页面已改变，钱包响应已取消');
        }
        return { ok: true, value };
      } catch (error) {
        const problem = error instanceof BrowserError ? error : new BrowserError('INVALID_ARGUMENT', '钱包请求无效或无法处理');
        const code = problem.code === 'CANCELLED' ? 4001 : problem.code === 'FORBIDDEN' ? 4100 : problem.code === 'UNAVAILABLE' ? 4200 : -32603;
        return { ok: false, error: { code, message: problem.message } };
      }
    });
  }
  dispose() {
    ipcMain.removeHandler(channel); this.release();
    for (const [session, id] of this.preloads) session.unregisterPreloadScript(id);
    this.preloads.clear(); this.tabsByContents.clear();
  }
  private installSession(session: Session) {
    if (this.preloads.has(session)) return;
    this.preloads.set(session, session.registerPreloadScript({ type: 'frame', filePath: this.runtime.assets.walletPreloadPath }));
  }
  private sender(event: IpcMainInvokeEvent) {
    const tabId = this.tabsByContents.get(event.sender.id);
    if (!tabId || !event.senderFrame) throw new BrowserError('FORBIDDEN', '非网页钱包请求');
    if (!event.sender.mainFrame.framesInSubtree.includes(event.senderFrame)) throw new BrowserError('FORBIDDEN', '请求frame不属于此网页');
    const origin = new URL(event.senderFrame.url).origin;
    if (!/^https?:\/\//.test(origin) || origin === 'null') throw new BrowserError('FORBIDDEN', '此来源不能访问钱包');
    const tab = this.runtime.core.getTab(tabId);
    return { origin, tabId, navigationId: tab.navigationId, context: { profileId: tab.profileId, contextId: tab.contextId, isPrivate: tab.isPrivate, windowId: tab.windowId, requestId: crypto.randomUUID() } };
  }
  private async request(context: CommandContext, origin: string, tabId: string, input: z.infer<typeof providerSchema>): Promise<unknown> {
    const session = this.wallet.store.get(context);
    const accounts = session.document.accounts.filter((account) => account.chain === input.chain);
    const account = accounts.find((entry) => entry.id === session.document.selectedAccountId) ?? accounts[0];
    const allowed = (session.document.grants[origin] ?? []).filter((id) => accounts.some((entry) => entry.id === id));
    if (input.method === 'eth_accounts') return session.keyring.unlocked ? accounts.filter((entry) => allowed.includes(entry.id)).map((entry) => entry.address) : [];
    if (!account) throw new BrowserError('FORBIDDEN', '请在钱包中添加对应链的账户');
    const network = session.document.networks.find((entry) => entry.id === account.networkId)!;
    if (input.method === 'eth_chainId') return network.chainId;
    if (input.method === 'net_version') return network.chainId ? BigInt(network.chainId).toString() : '0';
    if (!session.keyring.unlocked) throw new BrowserError('FORBIDDEN', '钱包已锁定，请在钱包面板解锁');
    const source = { origin, tabId };
    if (input.method === 'eth_requestAccounts' || input.method === 'connect') {
      if (!allowed.includes(account.id)) {
        const id = this.wallet.transactions.connect(context, account.id, origin, tabId);
        await this.wallet.waitForApproval(context, id);
      }
      return input.chain === 'ethereum' ? [account.address] : { publicKey: account.address };
    }
    if (!allowed.includes(account.id)) throw new BrowserError('FORBIDDEN', '请先允许站点访问此账户');
    if (input.method === 'disconnect') { this.wallet.revokeSite(context, origin); return null; }
    if (input.method === 'personal_sign' || (input.chain === 'solana' && input.method === 'signMessage')) {
      let message: Uint8Array;
      if (input.chain === 'ethereum') {
        const [raw, address] = input.params;
        if (typeof raw !== 'string' || typeof address !== 'string' || address.toLowerCase() !== account.address.toLowerCase()) throw new BrowserError('FORBIDDEN', '签名账户与授权不一致');
        if (!/^0x([0-9a-f]{2})*$/i.test(raw)) throw new BrowserError('INVALID_ARGUMENT', '消息必须是十六进制字节');
        message = Buffer.from(raw.slice(2), 'hex');
      } else {
        if (typeof input.params[0] !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.params[0])) throw new BrowserError('INVALID_ARGUMENT', '消息格式无效');
        message = Buffer.from(input.params[0], 'base64');
      }
      const id = this.wallet.transactions.messageBytes(context, account.id, message, source);
      const signature = await this.wallet.waitForApproval(context, id);
      return input.chain === 'ethereum' ? signature : { signature, publicKey: account.address };
    }
    if (input.chain === 'ethereum' && input.method === 'eth_sendTransaction') {
      const transaction = input.params[0] as { from?: string; to?: string; value?: string; data?: string } | undefined;
      if (!transaction?.to || transaction.from?.toLowerCase() !== account.address.toLowerCase()) throw new BrowserError('FORBIDDEN', '交易账户与授权不一致');
      if (transaction.data && transaction.data !== '0x') throw new BrowserError('UNAVAILABLE', '合约交易需要可解释交易预览，当前不隐瞒调用数据后签名');
      const base = BigInt(transaction.value ?? '0x0');
      const factor = 10n ** BigInt(network.decimals);
      const value = `${base / factor}.${(base % factor).toString().padStart(network.decimals, '0')}`;
      const id = await this.wallet.store.serial(context, () => this.wallet.transactions.transfer(context, account.id, transaction.to!, value, source));
      return this.wallet.waitForApproval(context, id);
    }
    if (input.chain === 'ethereum' && ethereumReadMethods.has(input.method)) return rpc(network.rpcUrl, input.method, input.params);
    throw new BrowserError('UNAVAILABLE', `尚未映射此站点钱包方法：${input.method}`);
  }
}
