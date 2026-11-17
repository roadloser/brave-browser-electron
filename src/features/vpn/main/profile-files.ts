import { chmod, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { shell } from 'electron';
import { BrowserError } from '../../../shared/errors';
import { vpnProfileDocument } from './profile-document';
import type { VpnConfiguration } from './tunnel-port';

type InstallationFile = { path: string; timer: ReturnType<typeof setTimeout> };
export class VpnProfileFiles {
  private readonly files = new Map<string, InstallationFile>();
  constructor(private readonly directory: string, private readonly expired: (profileId: string, error?: unknown) => void) {}

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    for (const entry of await readdir(this.directory, { withFileTypes: true })) {
      if (/^vpn-[0-9a-f-]+\.mobileconfig$/.test(entry.name) && !entry.isDirectory()) await unlink(join(this.directory, entry.name));
    }
  }

  async open(configuration: VpnConfiguration): Promise<void> {
    if (process.platform !== 'darwin') throw new BrowserError('UNAVAILABLE', '当前VPN配置映射仅支持macOS');
    await this.clear(configuration.profileId);
    const path = join(this.directory, `vpn-${randomUUID()}.mobileconfig`);
    let document: string;
    try { document = vpnProfileDocument(configuration); }
    catch { throw new BrowserError('UNAVAILABLE', 'VPN凭据或系统配置字段无法编码，未生成安装文件'); }
    await writeFile(path, document, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try {
      const error = await shell.openPath(path);
      if (error) throw new BrowserError('UNAVAILABLE', '无法打开系统VPN配置安装界面，请稍后重试');
      const timer = setTimeout(() => {
        void this.clear(configuration.profileId).then(() => this.expired(configuration.profileId), error => this.expired(configuration.profileId, error));
      }, 10 * 60 * 1000);
      this.files.set(configuration.profileId, { path, timer });
    } catch (error) { await unlink(path).catch(() => undefined); throw error; }
  }

  async clear(profileId: string): Promise<void> {
    const file = this.files.get(profileId);
    if (!file) return;
    clearTimeout(file.timer);
    await unlink(file.path).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
    this.files.delete(profileId);
  }

  async dispose(): Promise<void> {
    const results = await Promise.allSettled([...this.files.keys()].map(profileId => this.clear(profileId)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), '部分VPN安装文件未清理，请在本应用数据目录移除');
  }
}
