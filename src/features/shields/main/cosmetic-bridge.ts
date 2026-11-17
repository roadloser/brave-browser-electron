import { ipcMain } from 'electron';
import { z } from 'zod';
import type { FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { SHIELDS_COSMETIC_CHANNEL } from '../page/protocol';
import { ShieldsService } from './shields-service';

const requestSchema = z.object({
  url: z.string().url().max(32768), initial: z.boolean(),
  classes: z.array(z.string().max(2048)).max(20_000),
  ids: z.array(z.string().max(2048)).max(20_000),
  hrefs: z.array(z.string().max(32768)).max(20_000),
});

export function registerCosmeticBridge(runtime: FeatureRuntime, service: ShieldsService) {
  ipcMain.handle(SHIELDS_COSMETIC_CHANNEL, (event, payload: unknown) => {
    const input = requestSchema.parse(payload);
    const tab = service.tabForContents(event.sender.id);
    const frame = event.senderFrame;
    if (!tab || !frame || frame.isDestroyed() || !event.sender.mainFrame.framesInSubtree.includes(frame)) {
      throw new BrowserError('FORBIDDEN', '过滤请求不属于受控页面');
    }
    if (event.sender.session !== runtime.core.sessionForContext(tab) || frame.url !== input.url) {
      throw new BrowserError('CANCELLED', '页面来源已变化，旧过滤请求取消');
    }
    if (!['http:', 'https:'].includes(new URL(frame.url).protocol)) throw new BrowserError('FORBIDDEN', '此页面不支持过滤');
    return service.cosmetic(event.sender.id, frame.url, {
      initial: input.initial, classes: input.classes, ids: input.ids, hrefs: input.hrefs,
    });
  });
  return () => ipcMain.removeHandler(SHIELDS_COSMETIC_CHANNEL);
}
