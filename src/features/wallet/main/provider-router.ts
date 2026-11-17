import { ipcMain, type IpcMainInvokeEvent, type Session } from 'electron';
import { z } from 'zod';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import type { WalletService } from './wallet-service';
import { handleProviderRequest } from './provider-requests';
import { solanaChain } from './provider-solana';
import { withWalletNetwork } from './context-network';

const channel = 'brave:wallet-provider';
const providerSchema = z.object({
  chain: z.enum(['ethereum', 'solana', 'cardano']),
  method: z.string().min(1).max(128),
  params: z.array(z.unknown()).max(20).default([]),
  accountId: z.string().optional(),
}).strict();

export class ProviderRouter {
  private readonly tabsByContents = new Map<number, string>();
  private readonly preloads = new Map<Session, string>();
  private readonly release: () => void;
  private readonly releaseWallet: () => void;
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
    this.releaseWallet = wallet.onChanged(() => this.publishAccounts());
    ipcMain.handle(channel, async (event, raw: unknown) => {
      try {
        const payload = providerSchema.parse(raw);
        if (JSON.stringify(payload).length > 200000) throw new BrowserError('INVALID_ARGUMENT', '钱包请求过大');
        const { context, origin, tabId, navigationId } = this.sender(event);
        const frame = event.senderFrame;
        const sourceIsCurrent = () => {
          try {
            return !frame.isDestroyed() && !event.sender.isDestroyed() &&
              event.sender.mainFrame.framesInSubtree.includes(frame) &&
              new URL(frame.url).origin === origin &&
              runtime.core.getTab(tabId).navigationId === navigationId;
          } catch { return false; }
        };
        const value = await withWalletNetwork(context, runtime.network, () => handleProviderRequest(wallet, context, origin, tabId, payload, sourceIsCurrent));
        const current = runtime.core.getTab(tabId);
        if (current.navigationId !== navigationId || event.senderFrame.isDestroyed() || new URL(event.senderFrame.url).origin !== origin) {
          throw new BrowserError('CANCELLED', '页面已改变，钱包响应已取消');
        }
        return { ok: true, value };
      } catch (error) {
        const problem = error instanceof BrowserError ? error : new BrowserError('INVALID_ARGUMENT', '钱包请求无效或无法处理');
        const code = Number(problem.details?.providerCode) || (problem.code === 'CANCELLED' ? 4001 : problem.code === 'FORBIDDEN' ? 4100 : problem.code === 'UNAVAILABLE' ? 4200 : -32603);
        return { ok: false, error: { code, message: problem.message } };
      }
    });
  }
  dispose() {
    ipcMain.removeHandler(channel); this.release(); this.releaseWallet();
    for (const [session, id] of this.preloads) session.unregisterPreloadScript(id);
    this.preloads.clear(); this.tabsByContents.clear();
  }
  private installSession(session: Session) {
    if (this.preloads.has(session)) return;
    this.preloads.set(session, session.registerPreloadScript({ type: 'frame', filePath: this.runtime.assets.walletPreloadPath }));
  }
  private publishAccounts() {
    for (const tabId of this.tabsByContents.values()) {
      try {
        const tab = this.runtime.core.getTab(tabId);
        if (!this.wallet.store.exists(tab)) continue;
        const context = { ...tab, windowId: tab.windowId, requestId: '' };
        const session = this.wallet.store.get(context);
        for (const frame of this.runtime.core.getTabWebContents(tabId).mainFrame.framesInSubtree) {
          const origin = new URL(frame.url).origin;
          if (!/^https?:\/\//.test(origin)) continue;
          const allowed = session.document.grants[origin] ?? [];
          const accounts = session.keyring.unlocked ? session.document.accounts.filter((account) => allowed.includes(account.id)) : [];
          const selected = accounts.find((account) => account.id === session.document.selectedAccountId) ?? accounts[0];
          const solana = accounts.find((account) => account.chain === 'solana');
          const solanaNetwork = session.document.networks.find((network) => network.id === solana?.networkId);
          frame.send('brave:wallet-provider-state', {
            ethereumAccounts: accounts.filter((account) => account.chain === 'ethereum').map((account) => account.address),
            chainId: session.document.networks.find((network) => network.id === selected?.networkId)?.chainId ?? '0x1',
            solanaPublicKey: solana?.address ?? null,
            solanaChain: solanaNetwork ? solanaChain(solanaNetwork.rpcUrl, solanaNetwork.testnet) : 'solana:mainnet',
          });
        }
      } catch {}
    }
  }
  private sender(event: IpcMainInvokeEvent) {
    const tabId = this.tabsByContents.get(event.sender.id);
    if (!tabId || !event.senderFrame) throw new BrowserError('FORBIDDEN', '非网页钱包请求');
    if (!event.sender.mainFrame.framesInSubtree.includes(event.senderFrame)) throw new BrowserError('FORBIDDEN', '请求frame不属于此网页');
    const origin = new URL(event.senderFrame.url).origin;
    if (!/^https?:\/\//.test(origin) || origin === 'null') throw new BrowserError('FORBIDDEN', '此来源不能访问钱包');
    const tab = this.runtime.core.getTab(tabId);
    return { origin, tabId, navigationId: tab.navigationId, context: { profileId: tab.profileId, contextId: tab.contextId, isPrivate: tab.isPrivate, kind: tab.kind, windowId: tab.windowId, requestId: crypto.randomUUID() } };
  }
}
