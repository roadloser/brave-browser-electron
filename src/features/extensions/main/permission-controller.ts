import { dialog } from 'electron';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { ExtensionRepository } from './extension-repository';

export class ExtensionPermissionController {
  constructor(private readonly runtime: FeatureRuntime) {}

  async request(profileId: string, extension: Electron.Extension, requested: { permissions?: string[]; origins?: string[] }): Promise<boolean> {
    const repository = new ExtensionRepository(this.runtime.storage.open(profileId));
    const record = repository.get(extension.id);
    if (!record?.enabled) return false;
    const grants = [...new Set([...(requested.permissions ?? []), ...(requested.origins ?? [])])];
    if (grants.every(grant => record.optionalGrants.includes(grant))) return true;
    const result = await dialog.showMessageBox({
      type: 'question', title: '扩展权限请求',
      message: `“${record.name}”请求其他权限`,
      detail: grants.join('\n'), buttons: ['拒绝', '允许'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (result.response !== 1) return false;
    const current = repository.get(extension.id);
    if (!current?.enabled) return false;
    repository.save({ ...current, optionalGrants: [...new Set([...current.optionalGrants, ...grants])] });
    return true;
  }
}
