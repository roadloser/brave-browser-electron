import { randomUUID } from 'node:crypto';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Session } from 'electron';
import { profilePath } from '../../../main/platform/storage/profile-paths';
import { BrowserError } from '../../../shared/errors';
import { fingerprintDirectory } from './manifest';
import { ExtensionRepository, type StoredExtension } from './extension-repository';
import type { InstallProposal } from './install-proposals';
import { retainDeclaredGrants } from './permission-metadata';

async function exists(path: string): Promise<boolean> { return access(path).then(() => true, () => false); }

export class ExtensionVersionInstaller {
  constructor(private readonly repository: ExtensionRepository, private readonly session: Session, private readonly profileId: string) {}

  async recover(): Promise<void> {
    for (const swap of this.repository.pendingSwaps()) {
      if (await exists(swap.previousPath)) {
        await rm(swap.currentPath, { recursive: true, force: true });
        await rename(swap.previousPath, swap.currentPath);
      } else if (!swap.oldRecord) await rm(swap.currentPath, { recursive: true, force: true });
      await rm(swap.candidatePath, { recursive: true, force: true });
      this.repository.finishSwap(swap.currentPath);
    }
  }

  async install(proposal: InstallProposal): Promise<StoredExtension> {
    if (await fingerprintDirectory(proposal.directory) !== proposal.hash) throw new BrowserError('CONFLICT', '扩展文件在确认期间已改变，请重新选择');
    const previous = proposal.replacesId ? this.repository.get(proposal.replacesId) : undefined;
    if (proposal.replacesId && !previous) throw new BrowserError('NOT_FOUND', '待更新的扩展已删除');
    if (previous && (previous.version !== proposal.previousVersion || previous.hash !== proposal.previousHash || previous.enabled !== proposal.wasEnabled)) {
      throw new BrowserError('CONFLICT', '扩展版本或启用状态在确认期间改变，请重新检查更新');
    }
    const currentPath = previous?.path ?? join(profilePath(this.profileId), 'extensions', 'installed', proposal.expectedId ?? randomUUID(), 'current');
    const previousPath = join(dirname(currentPath), 'previous');
    await mkdir(dirname(currentPath), { recursive: true, mode: 0o700 });
    await rm(previousPath, { recursive: true, force: true });
    this.repository.beginSwap({ currentPath, previousPath, candidatePath: proposal.directory, oldRecord: previous ?? null });
    let loaded: Electron.Extension | undefined;
    let movedPrevious = false;
    let placedCandidate = false;
    try {
      if (previous) this.session.extensions.removeExtension(previous.id);
      if (await exists(currentPath)) { await rename(currentPath, previousPath); movedPrevious = true; }
      await rename(proposal.directory, currentPath);
      placedCandidate = true;
      loaded = await this.session.extensions.loadExtension(currentPath, { allowFileAccess: false });
      if ((proposal.expectedId && loaded.id !== proposal.expectedId) || (previous && loaded.id !== previous.id)) {
        throw new BrowserError('CONFLICT', '扩展身份在更新中发生变化，已保留原版本');
      }
      const record: StoredExtension = {
        id: loaded.id, name: proposal.name, version: proposal.version, description: proposal.description,
        enabled: previous?.enabled ?? true, path: currentPath, permissions: proposal.permissions, hostPermissions: proposal.hostPermissions,
        status: previous?.enabled === false ? 'disabled' : 'loaded', hasAction: Boolean(proposal.manifest.action || proposal.manifest.browser_action),
        source: proposal.source, sourcePath: proposal.sourcePath, hash: proposal.hash,
        optionalGrants: retainDeclaredGrants(previous?.optionalGrants ?? [], proposal.manifest),
      };
      if (!record.enabled) this.session.extensions.removeExtension(loaded.id);
      this.repository.finishSwap(currentPath, record);
      return record;
    } catch (error) {
      if (loaded) this.session.extensions.removeExtension(loaded.id);
      if (placedCandidate) await rm(currentPath, { recursive: true, force: true });
      if (movedPrevious && await exists(previousPath)) {
        await rename(previousPath, currentPath);
        if (previous?.enabled) {
          try { await this.session.extensions.loadExtension(currentPath, { allowFileAccess: false }); }
          catch { if (previous) this.repository.save({ ...previous, status: 'failed', error: '新版本加载失败，原版本恢复也失败；文件已保留，可重试加载' }); }
        }
      }
      this.repository.finishSwap(currentPath);
      throw error;
    } finally { await rm(proposal.cleanupPath, { recursive: true, force: true }); }
  }
}
