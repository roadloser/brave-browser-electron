import type { WebContents } from 'electron';
import { SHIELDS_INVALIDATE_CHANNEL } from '../page/protocol';

export function invalidateCosmetics(contents: WebContents): void {
  if (contents.isDestroyed()) return;
  for (const frame of contents.mainFrame.framesInSubtree) {
    if (frame.isDestroyed()) continue;
    try { frame.send(SHIELDS_INVALIDATE_CHANNEL); } catch {}
  }
}
