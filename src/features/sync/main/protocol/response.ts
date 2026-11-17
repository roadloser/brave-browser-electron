import { BrowserError } from '../../../../shared/errors';
import type { CommitResult, SyncResponse } from './types';

export function commitResults(response: SyncResponse, expected: number): CommitResult[] {
  const values = Object.values(response.commit ?? {}).find(value => Array.isArray(value));
  if (!Array.isArray(values) || values.length !== expected) throw new BrowserError('CONFLICT', '同步提交响应数量不一致，保留待发送记录');
  return values as CommitResult[];
}
export function assertCommitted(response: SyncResponse, expected: number): CommitResult[] {
  const results = commitResults(response, expected);
  if (results.some(result => result.response_type !== 1)) throw new BrowserError('CONFLICT', '同步元数据提交发生冲突，请重新同步后处理');
  return results;
}
