import { dialog, nativeImage, type BrowserWindow } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserError } from '../../../shared/errors';

export async function chooseBackground(window: BrowserWindow) {
  const choice = await dialog.showOpenDialog(window, {
    title: '选择新标签页背景', properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (choice.canceled || !choice.filePaths[0]) return null;
  const path = choice.filePaths[0];
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > 20 * 1024 * 1024) {
    throw new BrowserError('INVALID_ARGUMENT', '请选择不超过 20 MB 的图片');
  }
  const image = nativeImage.createFromBuffer(await readFile(path));
  if (image.isEmpty()) throw new BrowserError('INVALID_ARGUMENT', '无法读取这张图片，请换用 PNG、JPEG 或 WebP');
  const size = image.getSize();
  const scale = Math.min(1, 3840 / Math.max(size.width, size.height));
  const resized = scale < 1 ? image.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale), quality: 'best' }) : image;
  return { id: randomUUID(), name: basename(path), dataUrl: `data:image/jpeg;base64,${resized.toJPEG(86).toString('base64')}` };
}
