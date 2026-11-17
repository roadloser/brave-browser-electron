import { ZodError } from 'zod';
import { BrowserError, type WireError } from '../../shared/errors';

export function mapError(error: unknown): WireError {
  if (error instanceof BrowserError) {
    return { code: error.code, message: error.message, recoverable: error.recoverable, details: error.details };
  }
  if (error instanceof ZodError) return { code: 'INVALID_ARGUMENT', message: '请求参数不符合浏览器契约', recoverable: true };
  return { code: 'INTERNAL', message: '操作未完成，请重试。若持续发生，请查看该模块的状态。', recoverable: true };
}
