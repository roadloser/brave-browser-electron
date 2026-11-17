import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserError } from '../../../shared/errors';
import type { VpnSystemStatus } from '../../../shared/contracts/vpn';
import type { VpnConfiguration, VpnTunnelPort, VpnTunnelSnapshot } from './tunnel-port';

const execute = promisify(execFile);
const serviceLine = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b.*"([^"]+)"\s+\[VPN:IKEv2\]\s*$/i;
const statusValues: Record<string, VpnSystemStatus> = { Connected: 'connected', Disconnected: 'disconnected', Connecting: 'connecting', Disconnecting: 'disconnecting', Invalid: 'invalid' };

export class MacIkev2Adapter implements VpnTunnelPort {
  readonly supported = process.platform === 'darwin';
  private readonly managed = new Map<string, VpnConfiguration>();

  async inspect(configuration: VpnConfiguration): Promise<VpnTunnelSnapshot> {
    const serviceId = await this.find(configuration);
    if (!serviceId) return { status: 'not-installed', serviceId: null };
    const output = await this.command('status', serviceId);
    const status = statusValues[output.trim().split(/\r?\n/)[0]] ?? 'unknown';
    this.managed.set(configuration.id, configuration);
    return { status, serviceId };
  }

  async connect(configuration: VpnConfiguration, signal: AbortSignal, changed: (status: VpnTunnelSnapshot) => void): Promise<VpnTunnelSnapshot> {
    signal.throwIfAborted();
    const current = await this.inspect(configuration);
    if (!current.serviceId) throw new BrowserError('UNAVAILABLE', '尚未识别此版本的系统VPN配置，请先完成安装并刷新');
    if (current.status === 'connected') return current;
    if (!['disconnected', 'invalid'].includes(current.status)) throw new BrowserError('CONFLICT', '系统VPN状态未稳定，暂不能开始连接');
    signal.throwIfAborted();
    try {
      await this.command('start', current.serviceId);
      return await this.waitFor(configuration, 'connected', 45000, signal, changed);
    } catch (error) {
      try { await this.disconnect(configuration); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'VPN连接失败且无法确认已断开，请查看系统VPN状态'); }
      throw error;
    }
  }

  async disconnect(configuration: VpnConfiguration, signal?: AbortSignal): Promise<VpnTunnelSnapshot> {
    const current = await this.inspect(configuration);
    if (!current.serviceId || current.status === 'disconnected') return current;
    signal?.throwIfAborted();
    await this.command('stop', current.serviceId);
    return this.waitFor(configuration, 'disconnected', 15000, signal);
  }

  async dispose(): Promise<void> {
    const results = await Promise.allSettled([...this.managed.values()].map(configuration => this.disconnect(configuration)));
    this.managed.clear();
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), '无法确认本应用VPN已在退出时断开');
  }

  private async find(configuration: VpnConfiguration): Promise<string | null> {
    const output = await this.command('list');
    const matches = output.split(/\r?\n/).map(line => serviceLine.exec(line)).filter(match => match?.[2] === configuration.serviceName);
    if (!matches.length) return null;
    if (matches.length !== 1) throw new BrowserError('CONFLICT', '系统存在重复的本应用VPN标识，请在系统设置中移除重复项');
    const serviceId = matches[0]![1];
    const details = await this.command('show', serviceId);
    const fields = details.split(/\r?\n/).map(line => line.trim());
    if (!fields.includes(`RemoteAddress : ${configuration.hostname}`) || !fields.includes(`RemoteIdentifier : ${configuration.hostname}`)) {
      throw new BrowserError('CONFLICT', '系统VPN远端与本应用已保存配置不一致，拒绝操作');
    }
    return serviceId;
  }

  private async waitFor(configuration: VpnConfiguration, expected: VpnSystemStatus, timeout: number, signal?: AbortSignal, changed?: (snapshot: VpnTunnelSnapshot) => void): Promise<VpnTunnelSnapshot> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const snapshot = await this.inspect(configuration);
      changed?.(snapshot);
      if (snapshot.status === expected || (expected === 'disconnected' && snapshot.status === 'not-installed')) return snapshot;
      if (snapshot.status === 'invalid' || snapshot.status === 'unknown' || snapshot.status === 'not-installed') throw new BrowserError('UNAVAILABLE', '系统VPN配置或状态不可用');
      await delay(1000, undefined, { signal });
    }
    throw new BrowserError('UNAVAILABLE', expected === 'connected' ? 'VPN连接超时' : '未能确认VPN已断开');
  }

  private async command(action: 'list' | 'show' | 'status' | 'start' | 'stop', serviceId?: string): Promise<string> {
    if (!this.supported) throw new BrowserError('UNAVAILABLE', '当前系统不支持此IKEv2映射');
    if (action !== 'list' && !serviceId?.match(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i)) throw new BrowserError('INVALID_ARGUMENT', '系统VPN服务标识无效');
    try {
      const result = await execute('/usr/sbin/scutil', ['--nc', action, ...(serviceId ? [serviceId] : [])], {
        timeout: 5000, maxBuffer: 262144, encoding: 'utf8', env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
      });
      return result.stdout;
    } catch { throw new BrowserError('UNAVAILABLE', `系统VPN${action === 'start' ? '连接' : action === 'stop' ? '断开' : '查询'}命令未完成，请检查系统权限与配置`); }
  }
}
