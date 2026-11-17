import { randomUUID } from 'node:crypto';
import type { CommandContext } from '../../../shared/module-lifecycle';
import type { WalletRequest } from '../../../shared/contracts/wallet';
import { BrowserError } from '../../../shared/errors';
import type { WalletStateStore } from './wallet-state';
import type { ChainRegistry } from './chain-registry';

export class TransactionController {
  private readonly validators = new Map<string, () => boolean>();
  constructor(private readonly store: WalletStateStore, private readonly chains: ChainRegistry, private readonly publish: (context: CommandContext) => void) {}
  async transfer(context: CommandContext, accountId: string, to: string, value: string, source?: { origin: string; tabId: string }) {
    const session = this.store.get(context);
    const account = session.document.accounts.find((entry) => entry.id === accountId);
    if (!account) throw new BrowserError('NOT_FOUND', '账户不存在');
    const network = session.document.networks.find((entry) => entry.id === account.networkId)!;
    const adapter = this.chains.get(account.chain);
    if (!adapter.capability.transfer) throw new BrowserError('UNAVAILABLE', adapter.capability.reason || '此链暂不支持转账');
    const prepared = await session.keyring.use((mnemonic) => adapter.prepare({ mnemonic, index: account.index }, account, network, { to, value }));
    if (!session.keyring.unlocked || !this.store.exists(context)) throw new BrowserError('CANCELLED', '钱包已锁定');
    const id = randomUUID();
    this.store.update(context, (document) => {
      document.requests.push({ id, kind: 'transfer', accountId, networkId: network.id,
        summary: `发送 ${value} ${network.symbol}`, details: prepared.details, status: 'pending', createdAt: Date.now(), ...source });
      document.pending[id] = { prepared };
    });
    this.publish(context); return id;
  }
  message(context: CommandContext, accountId: string, message: string, source?: { origin: string; tabId: string }) {
    const session = this.store.get(context);
    const account = session.document.accounts.find((entry) => entry.id === accountId);
    if (!account) throw new BrowserError('NOT_FOUND', '账户不存在');
    if (!this.chains.get(account.chain).capability.messageSign) throw new BrowserError('UNAVAILABLE', '此链消息签名尚未适配');
    if (!session.keyring.unlocked) throw new BrowserError('FORBIDDEN', '请先解锁钱包');
    const id = randomUUID();
    this.store.update(context, (document) => {
      document.requests.push({ id, kind: 'message', accountId, networkId: account.networkId, summary: '签署消息',
        details: { message, address: account.address }, status: 'pending', createdAt: Date.now(), ...source });
      document.pending[id] = { message };
    });
    this.publish(context); return id;
  }
  async approve(context: CommandContext, id: string): Promise<string> {
    const session = this.store.get(context);
    const request = session.document.requests.find((entry) => entry.id === id);
    if (!request || request.status !== 'pending') throw new BrowserError('CONFLICT', '请求已处理或不存在');
    const account = session.document.accounts.find((entry) => entry.id === request.accountId);
    const network = session.document.networks.find((entry) => entry.id === request.networkId);
    const pending = session.document.pending[id];
    if (!account || !network || !pending) throw new BrowserError('NOT_FOUND', '交易上下文已失效');
    if (!session.keyring.unlocked) throw new BrowserError('FORBIDDEN', '请先解锁钱包再确认');
    this.assertSource(id);
    let broadcastStarted = false;
    let knownHash: string | undefined;
    try {
      let result: string;
      if (request.kind === 'connect') {
        this.store.update(context, (document) => {
          if (request.origin) document.grants[request.origin] = [...new Set([...(document.grants[request.origin] ?? []), account.id])];
        });
        result = account.address;
      } else if (request.kind === 'message') {
        const adapter = this.chains.get(account.chain);
        result = await session.keyring.use((mnemonic) => {
          if (pending.messageBase64) {
            if (!adapter.signBytes) throw new BrowserError('UNAVAILABLE', '此链不支持原始字节消息签名');
            return adapter.signBytes({ mnemonic, index: account.index }, network, Buffer.from(pending.messageBase64, 'base64'));
          }
          return adapter.signMessage({ mnemonic, index: account.index }, network, pending.message!);
        });
        this.assertSource(id);
      } else {
        if (!pending.prepared || pending.prepared.expiresAt <= Date.now()) throw new BrowserError('CONFLICT', '交易报价已过期，请重新发起并确认');
        const adapter = this.chains.get(account.chain);
        const signed = await session.keyring.use((mnemonic) => adapter.sign({ mnemonic, index: account.index }, network, pending.prepared!));
        this.assertSource(id);
        if (!session.keyring.unlocked || !this.store.exists(context) ||
            session.document.requests.find((entry) => entry.id === id)?.status !== 'pending') {
          throw new BrowserError('CANCELLED', '钱包已锁定或请求已取消，未广播交易');
        }
        if (pending.providerMethod === 'signOnly') {
          result = signed.payload;
        } else {
          knownHash = signed.hash;
          this.store.update(context, (document) => {
            document.transactions.unshift({ id, chain: account.chain, accountId: account.id, networkId: network.id,
              to: pending.prepared!.to, value: pending.prepared!.value, hash: knownHash, status: 'pending', createdAt: Date.now() });
          });
          broadcastStarted = true;
          result = await adapter.broadcast(network, signed);
          this.store.update(context, (document) => {
            const transaction = document.transactions.find((entry) => entry.id === id)!;
            transaction.hash = result;
          });
        }
      }
      this.store.update(context, (document) => {
        const next = document.requests.find((entry) => entry.id === id)!;
        next.status = 'approved'; next.result = result; delete document.pending[id];
      });
      this.publish(context); return result;
    } catch (error) {
      if (!this.store.exists(context)) throw error;
      this.store.update(context, (document) => {
        const next = document.requests.find((entry) => entry.id === id)!;
        next.status = 'failed'; next.error = error instanceof Error ? error.message : '签名或提交失败';
        delete document.pending[id];
        const transaction = document.transactions.find((entry) => entry.id === id);
        if (transaction) {
          transaction.status = broadcastStarted ? 'unknown' : 'failed';
          transaction.error = broadcastStarted ? '广播响应不确定，请查询状态；不要重复发送' : next.error;
        }
      });
      this.publish(context); throw error;
    } finally { this.validators.delete(id); }
  }
  reject(context: CommandContext, id: string) {
    this.validators.delete(id);
    this.store.update(context, (document) => {
      const request = document.requests.find((entry) => entry.id === id);
      if (!request || request.status !== 'pending') throw new BrowserError('NOT_FOUND', '待确认请求不存在');
      request.status = 'rejected'; delete document.pending[id];
    });
    this.publish(context);
  }
  connect(context: CommandContext, accountId: string, origin: string, tabId: string) {
    const account = this.store.get(context).document.accounts.find((entry) => entry.id === accountId);
    if (!account) throw new BrowserError('NOT_FOUND', '请先添加对应链的账户');
    const id = randomUUID();
    const request: WalletRequest = { id, kind: 'connect', origin, tabId, accountId, networkId: account.networkId,
      summary: '允许站点查看账户地址', details: { origin, address: account.address }, status: 'pending', createdAt: Date.now() };
    this.store.update(context, (document) => { document.requests.push(request); document.pending[id] = {}; });
    this.publish(context); return id;
  }
  messageBytes(context: CommandContext, accountId: string, bytes: Uint8Array, source: { origin: string; tabId: string }) {
    const session = this.store.get(context);
    const account = session.document.accounts.find((entry) => entry.id === accountId);
    if (!account || !this.chains.get(account.chain).signBytes) throw new BrowserError('UNAVAILABLE', '此账户尚未接入字节消息签名');
    if (!session.keyring.unlocked) throw new BrowserError('FORBIDDEN', '请先解锁钱包');
    const id = randomUUID();
    const encoded = Buffer.from(bytes);
    let preview: string;
    try { preview = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { preview = '二进制消息，请核对完整十六进制内容'; }
    this.store.update(context, (document) => {
      document.requests.push({ id, kind: 'message', accountId, networkId: account.networkId, ...source,
        summary: '签署站点消息', details: { message: preview, messageHex: '0x'+encoded.toString('hex'), bytes: String(bytes.length), address: account.address }, status: 'pending', createdAt: Date.now() });
      document.pending[id] = { messageBase64: encoded.toString('base64') };
    });
    this.publish(context); return id;
  }
  bindSource(id: string, validator: () => boolean) { this.validators.set(id, validator); }
  async dapp(context: CommandContext, accountId: string, payload: unknown, source?: { origin: string; tabId: string }, signOnly = false) {
    const session = this.store.get(context);
    const account = session.document.accounts.find((entry) => entry.id === accountId);
    if (!account) throw new BrowserError('NOT_FOUND', '账户不存在');
    const network = session.document.networks.find((entry) => entry.id === account.networkId)!;
    const adapter = this.chains.get(account.chain);
    if (!adapter.prepareDapp) throw new BrowserError('UNAVAILABLE', '此链站点交易协议尚未映射');
    const prepared = await session.keyring.use((mnemonic) => adapter.prepareDapp!({ mnemonic, index: account.index }, account, network, payload));
    const id = randomUUID();
    this.store.update(context, (document) => {
      document.requests.push({ id, kind: 'transaction', accountId, networkId: network.id, ...source,
        summary: signOnly ? '签署站点交易（不广播）' : '签署并提交站点交易', details: prepared.details, status: 'pending', createdAt: Date.now() });
      document.pending[id] = { prepared, providerMethod: signOnly ? 'signOnly' : undefined };
    });
    this.publish(context); return id;
  }
  private assertSource(id: string) {
    const validator = this.validators.get(id);
    if (validator && !validator()) throw new BrowserError('CANCELLED', '站点页面或授权已经改变，请重新发起请求');
  }
}
