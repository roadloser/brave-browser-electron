import { createConnection, type Socket } from 'node:net';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BrowserError } from '../../../shared/errors';
import { ControlProtocol, type ControlReply } from './control-protocol';

export interface TorControlPort {
  connect(port: number, cookiePath: string, signal: AbortSignal): Promise<void>;
  command(command: string): Promise<string[]>;
  close(): void;
}
type Pending = { resolve: (lines: string[]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export class NodeTorControlClient implements TorControlPort {
  private socket?: Socket;
  private pending?: Pending;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = true;
  constructor(private readonly lost: (reason: string) => void) {}
  async connect(port: number, cookiePath: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    this.closed = false;
    const socket = createConnection({ host: '127.0.0.1', port });
    this.socket = socket;
    const parser = new ControlProtocol(reply => this.received(reply));
    socket.on('data', data => { try { parser.push(data); } catch { this.fail('Tor 控制响应解析失败'); } });
    socket.on('error', () => this.fail('Tor 控制通道发生错误'));
    socket.on('close', () => { if (!this.closed) this.fail('Tor 控制通道已断开'); });
    const abort = () => this.close();
    signal.addEventListener('abort', abort, { once: true });
    socket.once('close', () => signal.removeEventListener('abort', abort));
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { socket.destroy(); reject(new BrowserError('UNAVAILABLE', '连接 Tor 控制通道超时')); }, 10000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      socket.once('error', () => { clearTimeout(timeout); reject(new BrowserError('UNAVAILABLE', '无法连接 Tor 控制通道')); });
      socket.once('close', () => { clearTimeout(timeout); reject(new BrowserError('CANCELLED', 'Tor 控制连接已取消')); });
    });
    const cookie = await readFile(cookiePath);
    if (cookie.length !== 32) throw new BrowserError('UNAVAILABLE', 'Tor 控制认证 cookie 无效');
    const nonce = randomBytes(32);
    const challenge = (await this.command('AUTHCHALLENGE SAFECOOKIE ' + nonce.toString('hex'))).join(' ');
    const hashMatch = /SERVERHASH=([a-f0-9]{64})/i.exec(challenge);
    const nonceMatch = /SERVERNONCE=([a-f0-9]{64})/i.exec(challenge);
    if (!hashMatch || !nonceMatch) throw new BrowserError('UNAVAILABLE', 'Tor 不支持所需的 SAFECOOKIE 认证');
    const message = Buffer.concat([cookie, nonce, Buffer.from(nonceMatch[1], 'hex')]);
    const expected = createHmac('sha256', 'Tor safe cookie authentication server-to-controller hash').update(message).digest();
    if (!timingSafeEqual(expected, Buffer.from(hashMatch[1], 'hex'))) throw new BrowserError('FORBIDDEN', 'Tor 控制服务身份校验失败');
    const response = createHmac('sha256', 'Tor safe cookie authentication controller-to-server hash').update(message).digest('hex');
    await this.command('AUTHENTICATE ' + response);
    cookie.fill(0); nonce.fill(0); message.fill(0);
    await this.command('TAKEOWNERSHIP');
  }
  command(command: string): Promise<string[]> {
    if (/[\r\n]/.test(command)) return Promise.reject(new BrowserError('INVALID_ARGUMENT', 'Tor 控制命令含换行'));
    const operation = this.queue.then(() => new Promise<string[]>((resolve, reject) => {
      if (this.closed || !this.socket || this.socket.destroyed) { reject(new BrowserError('UNAVAILABLE', 'Tor 控制通道不可用')); return; }
      const timer = setTimeout(() => this.fail('Tor 控制命令超时'), 10000);
      this.pending = { resolve, reject, timer };
      this.socket.write(command + '\r\n');
    }));
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  close(): void {
    this.closed = true;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new BrowserError('CANCELLED', 'Tor 控制操作已取消')); this.pending = undefined; }
    this.socket?.destroy(); this.socket = undefined;
  }
  private received(reply: ControlReply): void {
    if (reply.code === 650) return;
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer); this.pending = undefined;
    if (reply.code >= 200 && reply.code < 300) pending.resolve(reply.lines);
    else pending.reject(new BrowserError('UNAVAILABLE', 'Tor 控制命令被拒绝（' + reply.code + '）'));
  }
  private fail(reason: string): void { if (this.closed) return; this.close(); this.lost(reason); }
}
