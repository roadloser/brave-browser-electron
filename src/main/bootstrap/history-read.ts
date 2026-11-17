import type { BrowserContext } from '../../shared/contracts/browser-core';
import type { HistoryReader, HistoryReadPort } from '../../shared/history-read-port';
import { BrowserError } from '../../shared/errors';

export class HistoryReadCoordinator implements HistoryReadPort {
  private reader?: HistoryReader;

  register(reader: HistoryReader) {
    if (this.reader) throw new BrowserError('CONFLICT', '历史读取映射重复注册', false);
    this.reader = reader;
    return () => { if (this.reader === reader) this.reader = undefined; };
  }

  recentUrls(context: BrowserContext, options: { since: number; limit: number }): string[] {
    if (context.isPrivate) return [];
    if (!this.reader) throw new BrowserError('UNAVAILABLE', '历史读取映射未接入');
    if (!Number.isFinite(options.since) || !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 2000) {
      throw new BrowserError('INVALID_ARGUMENT', '历史读取范围无效');
    }
    return this.reader.recentUrls(context, options);
  }
}
