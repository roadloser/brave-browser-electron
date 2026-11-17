import { randomUUID } from 'node:crypto';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { dialog } from 'electron';
import type { ExtensionInstallProposal } from '../../../shared/contracts/extensions';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { profilePath } from '../../../main/platform/storage/profile-paths';
import { BrowserError } from '../../../shared/errors';
import { fingerprintDirectory, manifestExtensionId, manifestPermissions, readManifest, type ExtensionManifest } from './manifest';
import type { StoredExtension } from './extension-repository';
import type { ExtensionPackageSourcePort } from './library-port';

export type InstallProposal = ExtensionInstallProposal & {
  profileId: string; contextId: string; windowId: string;
  directory: string; cleanupPath: string; hash: string; manifest: ExtensionManifest;
  source: 'directory' | 'web-store'; sourcePath?: string; expectedId?: string; expiresAt: number;
};

export class InstallProposals {
  private readonly proposals = new Map<string, InstallProposal>();
  private readonly timer = setInterval(() => { void this.expire(); }, 60_000);

  constructor(private readonly runtime: FeatureRuntime, private readonly packageSource: ExtensionPackageSourcePort) { this.timer.unref(); }

  async chooseDirectory(context: CommandContext): Promise<ExtensionInstallProposal | null> {
    const result = await dialog.showOpenDialog(this.runtime.core.getNativeWindow(context.windowId), {
      title: '选择解压后的扩展目录', properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return this.directory(context, result.filePaths[0]);
  }

  async directory(context: CommandContext, sourcePath: string, replacement?: StoredExtension): Promise<ExtensionInstallProposal> {
    await fingerprintDirectory(sourcePath);
    const cleanupPath = await this.staging(context.profileId);
    const directory = join(cleanupPath, 'candidate');
    try {
      await cp(sourcePath, directory, { recursive: true, dereference: false, errorOnExist: true });
      return await this.create(context, directory, cleanupPath, { source: 'directory', sourcePath, replacesId: replacement?.id });
    } catch (error) { await rm(cleanupPath, { recursive: true, force: true }); throw error; }
  }

  async store(context: CommandContext, extensionId: string, replacement?: StoredExtension): Promise<ExtensionInstallProposal> {
    if (!/^[a-p]{32}$/.test(extensionId)) throw new BrowserError('INVALID_ARGUMENT', 'Chrome 商店扩展 ID 无效');
    const cleanupPath = await this.staging(context.profileId);
    try {
      const directory = await this.packageSource.download(extensionId, cleanupPath);
      return await this.create(context, directory, cleanupPath, { source: 'web-store', expectedId: extensionId, replacesId: replacement?.id });
    } catch (error) { await rm(cleanupPath, { recursive: true, force: true }); throw error; }
  }

  take(context: CommandContext, id: string): InstallProposal {
    const proposal = this.proposals.get(id);
    if (!proposal || proposal.expiresAt < Date.now()) throw new BrowserError('NOT_FOUND', '安装确认已过期，请重新选择扩展');
    if (proposal.profileId !== context.profileId || proposal.contextId !== context.contextId || proposal.windowId !== context.windowId) {
      throw new BrowserError('FORBIDDEN', '安装确认不属于当前窗口');
    }
    this.proposals.delete(id);
    return proposal;
  }

  publicValue(proposal: InstallProposal): ExtensionInstallProposal {
    const { id, name, version, description, permissions, hostPermissions, replacesId } = proposal;
    return { id, name, version, description, permissions, hostPermissions, replacesId };
  }

  async dispose(): Promise<void> {
    clearInterval(this.timer);
    const active = [...this.proposals.values()];
    this.proposals.clear();
    await Promise.all(active.map(proposal => rm(proposal.cleanupPath, { recursive: true, force: true })));
  }

  private async create(context: CommandContext, directory: string, cleanupPath: string, source: Pick<InstallProposal, 'source' | 'sourcePath' | 'expectedId' | 'replacesId'>) {
    const hash = await fingerprintDirectory(directory);
    const manifest = await readManifest(directory);
    if (source.expectedId && manifestExtensionId(manifest) !== source.expectedId) throw new BrowserError('INVALID_ARGUMENT', '下载扩展的身份与请求不一致');
    const proposal: InstallProposal = {
      id: randomUUID(), profileId: context.profileId, contextId: context.contextId, windowId: context.windowId,
      directory, cleanupPath, hash, manifest, ...source,
      name: manifest.name, version: manifest.version, description: manifest.description ?? '',
      ...manifestPermissions(manifest), expiresAt: Date.now() + 10 * 60_000,
    };
    this.proposals.set(proposal.id, proposal);
    return this.publicValue(proposal);
  }

  private async staging(profileId: string): Promise<string> {
    const path = join(profilePath(profileId), 'extensions', 'staging', randomUUID());
    await mkdir(path, { recursive: true, mode: 0o700 });
    return path;
  }

  private async expire(): Promise<void> {
    for (const proposal of this.proposals.values()) {
      if (proposal.expiresAt >= Date.now()) continue;
      this.proposals.delete(proposal.id);
      await rm(proposal.cleanupPath, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
