import { dialog, nativeImage } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LeoAttachment } from '../../../shared/contracts/leo';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';

export class AttachmentStore {
  private readonly attachments = new Map<string, { attachment: LeoAttachment; contextId: string; expiresAt: number }>();
  private readonly disposedContexts = new Set<string>();
  private readonly release: () => void;
  constructor(private readonly runtime: FeatureRuntime) {
    this.release = runtime.core.onEvent((event) => {
      if (event.type !== 'contextDisposed') return;
      this.disposedContexts.add(event.context.contextId);
      for (const [id, entry] of this.attachments) if (entry.contextId === event.context.contextId) this.attachments.delete(id);
    });
  }
  async choose(context: CommandContext) {
    const choice = await dialog.showOpenDialog(this.runtime.core.getNativeWindow(context.windowId), {
      title: '添加图片', properties: ['openFile', 'multiSelections'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (choice.canceled) return [];
    if (choice.filePaths.length > 8) throw new BrowserError('INVALID_ARGUMENT', '一次最多添加 8 张图片');
    const prepared: LeoAttachment[] = [];
    for (const path of choice.filePaths) {
      if ((await stat(path)).size > 20 * 1024 * 1024) throw new BrowserError('INVALID_ARGUMENT', '每张图片不能超过 20 MB');
      const image = nativeImage.createFromBuffer(await readFile(path));
      if (image.isEmpty()) throw new BrowserError('INVALID_ARGUMENT', `无法读取图片：${basename(path)}`);
      const size = image.getSize();
      const scale = Math.min(1, 2048 / Math.max(size.width, size.height));
      const bytes = (scale < 1 ? image.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) }) : image).toJPEG(85);
      prepared.push({ id: randomUUID(), name: basename(path), mimeType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, size: bytes.length });
    }
    if (this.disposedContexts.has(context.contextId)) throw new BrowserError('CANCELLED', '窗口已关闭');
    this.expire();
    for (const attachment of prepared) this.attachments.set(attachment.id, { attachment, contextId: context.contextId, expiresAt: Date.now() + 30 * 60 * 1000 });
    return prepared;
  }
  remove(context: CommandContext, id: string) {
    const entry = this.attachments.get(id);
    if (entry && entry.contextId !== context.contextId) throw new BrowserError('FORBIDDEN', '图片不属于当前窗口');
    this.attachments.delete(id);
  }
  consume(context: CommandContext, ids: string[]) {
    this.expire();
    const entries = [...new Set(ids)].map((id) => this.attachments.get(id));
    if (entries.some((entry) => !entry || entry.contextId !== context.contextId)) throw new BrowserError('FORBIDDEN', '图片已过期或不属于当前窗口，请重新选择');
    const attachments = entries.map((entry) => entry!.attachment);
    for (const id of ids) this.attachments.delete(id);
    return attachments;
  }
  dispose() { this.release(); this.attachments.clear(); this.disposedContexts.clear(); }
  private expire() { for (const [id, entry] of this.attachments) if (entry.expiresAt < Date.now()) this.attachments.delete(id); }
}
