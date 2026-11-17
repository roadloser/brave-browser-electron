import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserError } from '../../../shared/errors';
import { componentFile, readTorComponent, type TorComponent } from './component-descriptor';
import { NodeTorControlClient } from './control-client';
import type { TorBootstrap, TorEndpoint, TorRuntimePort } from './runtime-port';

export class TorProcessAdapter implements TorRuntimePort {
  private process?: ChildProcess;
  private directory?: string;
  private control?: NodeTorControlClient;
  private stopping = false;
  constructor(private readonly failed: (reason: string) => void) {}
  async start(component: TorComponent, signal: AbortSignal): Promise<TorEndpoint> {
    const checked = await readTorComponent(component.directory);
    signal.throwIfAborted();
    if (checked.manifestHash !== component.manifestHash || checked.version !== component.version) throw new BrowserError('CONFLICT', 'Tor 组件已变化，请重新选择并确认完整性');
    this.stopping = false;
    const directory = await mkdtemp(join(tmpdir(), 'brave-electron-tor-'));
    this.directory = directory; await chmod(directory, 0o700);
    const portFile = join(directory, 'controlport');
    const cookieFile = join(directory, 'control.authcookie');
    const args = [
      '--ignore-missing-torrc', '-f', '/dev/null',
      '--DataDirectory', directory, '--ControlPort', '127.0.0.1:auto',
      '--ControlPortWriteToFile', portFile, '--CookieAuthentication', '1', '--CookieAuthFile', cookieFile,
      '--SocksPort', '127.0.0.1:auto', '--ClientOnly', '1', '--AvoidDiskWrites', '1',
      '--DisableNetwork', '1', '--Log', 'notice stdout', '--SafeLogging', '1',
      '--__OwningControllerProcess', String(process.pid),
    ];
    if (component.geoIpFile) args.push('--GeoIPFile', await componentFile(component.directory, component.geoIpFile));
    if (component.geoIpv6File) args.push('--GeoIPv6File', await componentFile(component.directory, component.geoIpv6File));
    const child = spawn(await componentFile(component.directory, component.executable), args, {
      cwd: component.directory, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8' },
    });
    this.process = child;
    let exited: string | undefined;
    child.once('error', () => { exited = '无法启动已选择的 Tor 组件'; if (!this.stopping) this.failed(exited); });
    child.once('exit', code => { exited = 'Tor 进程已退出（' + String(code) + '）'; if (!this.stopping) this.failed(exited); });
    child.stdout?.on('data', () => undefined); child.stderr?.on('data', () => undefined);
    const deadline = Date.now() + 20000;
    let port = 0;
    while (Date.now() < deadline && !port) {
      signal.throwIfAborted();
      if (exited) throw new BrowserError('UNAVAILABLE', exited);
      try {
        const text = await readFile(portFile, 'utf8');
        const match = /^PORT=127\.0\.0\.1:(\d+)\s*$/m.exec(text);
        if (match) port = Number(match[1]);
      } catch {}
      if (!port) await delay(100, undefined, { signal });
    }
    if (!port || port > 65535) throw new BrowserError('UNAVAILABLE', 'Tor 未提供有效的本地控制端口');
    const control = new NodeTorControlClient(reason => { if (!this.stopping) this.failed(reason); });
    this.control = control;
    await control.connect(port, cookieFile, signal);
    const version = (await control.command('GETINFO version')).find(line => line.startsWith('version='))?.slice(8).split(' ')[0];
    if (version !== component.version) throw new BrowserError('CONFLICT', 'Tor 运行版本与固定组件清单不一致');
    const listeners = (await control.command('GETINFO net/listeners/socks')).join(' ');
    const socks = /"127\.0\.0\.1:(\d+)"/.exec(listeners);
    if (!socks) throw new BrowserError('UNAVAILABLE', 'Tor 未提供预期的 loopback SOCKS 端点');
    return { socksPort: Number(socks[1]), version };
  }
  async enableNetwork(): Promise<void> { await this.requiredControl().command('SETCONF DisableNetwork=0'); }
  async bootstrap(): Promise<TorBootstrap> {
    const lines = await this.requiredControl().command('GETINFO status/bootstrap-phase status/circuit-established');
    const text = lines.join(' ');
    return {
      progress: Number(/PROGRESS=(\d+)/.exec(text)?.[1] ?? 0),
      summary: /SUMMARY="([^"]*)"/.exec(text)?.[1] ?? '正在连接 Tor 网络',
      circuitEstablished: lines.some(line => line === 'status/circuit-established=1'),
    };
  }
  async newIdentity(): Promise<void> { await this.requiredControl().command('SIGNAL NEWNYM'); }
  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    const child = this.process; this.process = undefined;
    try { await this.control?.command('SIGNAL SHUTDOWN'); } catch {}
    this.control?.close(); this.control = undefined;
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
        child.once('exit', () => { clearTimeout(timeout); resolve(); });
        child.kill('SIGTERM');
      });
    }
    if (this.directory) { const directory = this.directory; this.directory = undefined; await rm(directory, { recursive: true, force: true }); }
  }
  private requiredControl(): NodeTorControlClient {
    if (!this.control) throw new BrowserError('UNAVAILABLE', 'Tor 控制通道尚未连接');
    return this.control;
  }
}
