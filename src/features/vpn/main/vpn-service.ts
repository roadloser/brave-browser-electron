import { app, shell } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { BrowserError } from '../../../shared/errors';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import type { VpnState } from '../../../shared/contracts/vpn';
import { GuardianProvider } from './guardian-provider';
import type { VpnCredentialInput, VpnProviderPort } from './provider-port';
import { MacIkev2Adapter } from './mac-ikev2-adapter';
import type { VpnConfiguration, VpnTunnelPort } from './tunnel-port';
import { VpnRepository } from './repository';
import { VpnProfileFiles } from './profile-files';
import { VpnStateStore } from './vpn-state';
import { VpnOperations } from './vpn-operations';
import { VpnMonitor } from './vpn-monitor';
import { VpnConfigurationGuard } from './configuration-guard';

export class VpnService {
  private readonly repository: VpnRepository;
  private readonly provider: VpnProviderPort;
  private readonly tunnel: VpnTunnelPort;
  private readonly states: VpnStateStore;
  private readonly operations: VpnOperations;
  private readonly files: VpnProfileFiles;
  private readonly monitor: VpnMonitor;
  private readonly guard: VpnConfigurationGuard;

  constructor(private readonly runtime: FeatureRuntime) {
    this.repository = new VpnRepository(runtime.storage, runtime.secrets);
    this.provider = new GuardianProvider(runtime.network);
    this.tunnel = new MacIkev2Adapter();
    this.guard = new VpnConfigurationGuard(runtime.core, this.repository, this.tunnel);
    this.states = new VpnStateStore(runtime, this.repository, this.tunnel.supported);
    this.operations = new VpnOperations(this.states);
    this.files = new VpnProfileFiles(join(app.getPath('userData'), 'vpn-install'), (profileId, error) => this.states.patch(profileId, { installationPending: !!error, ...(error ? { error: 'VPN安装文件未能清理，请关闭安装界面后重试取消' } : {}) }));
    this.monitor = new VpnMonitor(async profileId => {
      if (this.operations.busy()) return true;
      const current = this.repository.get(profileId).current;
      if (!current) return false;
      const snapshot = await this.tunnel.inspect(current);
      this.states.system(profileId, snapshot);
      return ['connected', 'connecting', 'disconnecting'].includes(snapshot.status);
    }, profileId => this.states.patch(profileId, { phase: 'failed', systemStatus: 'unknown', summary: '无法继续确认系统VPN状态，请查看系统设置', error: '系统状态连续三次查询失败' }));
  }
  async initialize(): Promise<void> {
    try { await this.files.initialize(); }
    catch { for (const profile of this.runtime.core.getProfiles()) this.states.patch(profile.id, { phase: 'failed', summary: 'VPN临时配置目录暂不可用', error: '未能初始化或清理VPN安装文件，请检查本应用数据目录权限' }); }
  }
  get(profileId: string): VpnState { return this.states.get(profileId); }
  async refresh(profileId: string): Promise<VpnState> {
    this.states.saved(profileId);
    if (this.operations.busy()) return this.get(profileId);
    const current = this.repository.get(profileId).current;
    if (!current) return this.states.patch(profileId, { phase: this.get(profileId).hasCredential ? 'ready' : 'unconfigured', summary: '选择地区并准备系统VPN配置', error: undefined });
    const snapshot = await this.tunnel.inspect(current);
    this.states.system(profileId, snapshot);
    if (snapshot.serviceId) {
      await this.files.clear(profileId);
      this.states.patch(profileId, { installationPending: false });
    }
    if (['connected', 'connecting', 'disconnecting'].includes(snapshot.status)) this.monitor.watch(profileId);
    return this.get(profileId);
  }
  loadRegions(context: CommandContext): Promise<VpnState> {
    this.regular(context);
    return this.operations.run(context.profileId, 'preparing', '正在读取供应商地区目录', async signal => {
      const regions = await this.provider.regions(context, signal);
      signal.throwIfAborted();
      this.states.patch(context.profileId, { regions, phase: 'ready', summary: '已读取可用VPN地区' });
    });
  }
  setCredential(context: CommandContext, input: VpnCredentialInput): Promise<VpnState> {
    this.regular(context);
    return this.operations.run(context.profileId, 'authorizing', '正在处理订阅授权', async signal => {
      await this.assertDisconnected(context.profileId);
      const credential = await this.provider.authorize(context, input, signal);
      signal.throwIfAborted();
      this.repository.credential(context.profileId, credential);
      this.states.saved(context.profileId);
      this.states.patch(context.profileId, { phase: 'ready', summary: '订阅凭据已加密保存，获取服务器配置时确认资格' });
    });
  }
  prepare(context: CommandContext, regionId: string): Promise<VpnState> {
    this.regular(context);
    return this.operations.run(context.profileId, 'preparing', '正在申请所选地区的VPN配置', async signal => {
      await this.assertDisconnected(context.profileId);
      const record = this.repository.get(context.profileId);
      if (!record.credential) throw new BrowserError('FORBIDDEN', '请先提供合法订阅凭据');
      const regions = await this.provider.regions(context, signal);
      const region = regions.find(candidate => candidate.id === regionId);
      if (!region) throw new BrowserError('NOT_FOUND', '所选地区已不在供应商目录中，请重新选择');
      const credentials = await this.provider.credentials(context, record.credential, region, signal);
      signal.throwIfAborted();
      const id = randomUUID();
      const configuration: VpnConfiguration = { ...credentials, id, tunnelId: randomUUID(), profileId: context.profileId, region, createdAt: Date.now(),
        payloadIdentifier: `org.brave-electron.vpn.${createHash('sha256').update(context.profileId).digest('hex').slice(0, 24)}`, serviceName: `Brave Electron VPN ${id}` };
      this.repository.select(context.profileId, configuration);
      await this.files.clear(context.profileId);
      this.states.saved(context.profileId);
      this.states.patch(context.profileId, { regions, phase: 'awaiting-install', summary: 'VPN配置已加密保存，尚未安装到系统', systemStatus: 'not-installed', serviceId: null, installationPending: false });
    });
  }
  install(context: CommandContext): Promise<VpnState> {
    this.regular(context);
    return this.operations.run(context.profileId, 'preparing', '正在打开系统VPN安装界面', async signal => {
      await this.assertDisconnected(context.profileId);
      signal.throwIfAborted();
      await this.files.open(this.configuration(context.profileId));
      signal.throwIfAborted();
      this.states.patch(context.profileId, { phase: 'awaiting-install', summary: '请在系统设置完成安装，然后刷新安装状态', installationPending: true });
    });
  }
  connect(context: CommandContext): Promise<VpnState> {
    this.regular(context);
    return this.operations.run(context.profileId, 'connecting', '正在连接系统VPN', async signal => {
      const configuration = this.configuration(context.profileId);
      await this.guard.otherConnections(context.profileId, configuration.id);
      const snapshot = await this.tunnel.connect(configuration, signal, next => this.states.system(context.profileId, next));
      this.states.system(context.profileId, snapshot);
      this.monitor.watch(context.profileId);
    });
  }
  disconnect(context: CommandContext): Promise<VpnState> {
    this.regular(context);
    return this.operations.run(context.profileId, 'disconnecting', '正在断开系统VPN', async signal => {
      const snapshot = await this.tunnel.disconnect(this.configuration(context.profileId), signal);
      this.states.system(context.profileId, snapshot);
    });
  }
  async cancel(context: CommandContext): Promise<VpnState> {
    this.regular(context);
    await this.operations.cancel(context.profileId);
    await this.files.clear(context.profileId);
    this.states.patch(context.profileId, { installationPending: false });
    return this.refresh(context.profileId);
  }
  rollback(context: CommandContext): Promise<VpnState> {
    this.regular(context);
    return this.operations.run(context.profileId, 'preparing', '正在恢复上一版VPN配置', async signal => {
      await this.assertDisconnected(context.profileId);
      if (!this.repository.get(context.profileId).previous) throw new BrowserError('NOT_FOUND', '没有上一版VPN配置');
      signal.throwIfAborted();
      await this.files.clear(context.profileId);
      this.repository.rollback(context.profileId);
      this.states.saved(context.profileId);
      this.states.patch(context.profileId, { phase: 'awaiting-install', summary: '已恢复上一版配置，请重新安装并刷新状态', systemStatus: 'not-installed', serviceId: null, installationPending: false });
    });
  }
  forget(context: CommandContext): Promise<VpnState> {
    this.regular(context);
    return this.operations.run(context.profileId, 'preparing', '正在移除本地订阅凭据', async () => {
      await this.assertDisconnected(context.profileId);
      this.repository.forget(context.profileId);
      this.states.saved(context.profileId);
      this.states.patch(context.profileId, { phase: 'ready', summary: '已移除订阅凭据；已安装的系统配置仍由系统管理' });
    });
  }
  async openAccount(): Promise<void> { await shell.openExternal('https://account.brave.com/'); }
  async dispose(): Promise<void> {
    this.monitor.dispose();
    await this.operations.dispose();
    const results = await Promise.allSettled([this.files.dispose(), this.tunnel.dispose()]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'VPN退出清理未完全成功');
  }
  private configuration(profileId: string): VpnConfiguration {
    const current = this.repository.get(profileId).current;
    if (!current) throw new BrowserError('NOT_FOUND', '请先准备VPN配置');
    return current;
  }
  private async assertDisconnected(profileId: string): Promise<void> {
    await this.guard.disconnected(profileId);
  }
  private regular(context: CommandContext): void {
    if (context.isPrivate || context.kind === 'tor') throw new BrowserError('FORBIDDEN', '请在普通窗口管理系统VPN');
    if (!this.tunnel.supported) throw new BrowserError('UNAVAILABLE', '当前VPN映射仅支持macOS系统IKEv2');
  }
}
