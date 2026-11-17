import type { BrowserContext } from './contracts/browser-core';
import type { Dispose } from './contracts/envelope';

export interface HistoryReader {
  recentUrls(context: BrowserContext, options: { since: number; limit: number }): string[];
}
export interface HistoryReadPort extends HistoryReader {
  register(reader: HistoryReader): Dispose;
}
