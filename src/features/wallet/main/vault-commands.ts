import { dialog } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import type { WalletStateStore } from './wallet-state';

export class VaultCommands {
  constructor(private readonly runtime: FeatureRuntime, private readonly store: WalletStateStore) {}
  async create(context: CommandContext, password: string) {
    const session = this.store.get(context);
    if (session.document.vault) throw new BrowserError('CONFLICT', '钱包已存在，不会覆盖');
    const vault = await session.keyring.create(password);
    try { this.store.update(context, (document) => { document.vault = vault; }); }
    catch (error) { session.keyring.lock(); throw error; }
    await this.backup(context, password);
  }
  async import(context: CommandContext, password: string) {
    const session = this.store.get(context);
    if (session.document.vault) throw new BrowserError('CONFLICT', '请使用新资料导入其他钱包，避免覆盖现有钱包');
    const choice = await dialog.showOpenDialog(this.runtime.core.getNativeWindow(context.windowId), {
      title: '选择包含英语助记词的文本文件', properties: ['openFile'], filters: [{ name: '文本文件', extensions: ['txt'] }],
    });
    if (choice.canceled || !choice.filePaths[0]) return;
    const path = choice.filePaths[0];
    if ((await stat(path)).size > 4096) throw new BrowserError('INVALID_ARGUMENT', '助记词文件过大');
    const buffer = await readFile(path);
    try {
      const vault = await session.keyring.create(password, buffer.toString('utf8'));
      try { this.store.update(context, (document) => { document.vault = vault; }); }
      catch (error) { session.keyring.lock(); throw error; }
    } finally { buffer.fill(0); }
  }
  async unlock(context: CommandContext, password: string) {
    const session = this.store.get(context);
    if (!session.document.vault) throw new BrowserError('NOT_FOUND', '尚未创建钱包');
    await session.keyring.unlock(password, session.document.vault);
  }
  async backup(context: CommandContext, password: string) {
    const session = this.store.get(context);
    if (!session.document.vault) throw new BrowserError('NOT_FOUND', '尚未创建钱包');
    const phrase = await session.keyring.authenticate(password, session.document.vault);
    await dialog.showMessageBox(this.runtime.core.getNativeWindow(context.windowId), {
      type: 'warning', title: '备份钱包助记词', message: '请离线抄写并妥善保存',
      detail: phrase, buttons: ['我已记录'], noLink: true, defaultId: 0,
    });
    return { displayed: true };
  }
}
