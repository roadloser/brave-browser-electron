export type ErrorCode =
  | 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT'
  | 'STORAGE_FAILED' | 'UNAVAILABLE' | 'CANCELLED' | 'INTERNAL';

export type WireError = {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  details?: Record<string, string | number | boolean>;
};

export class BrowserError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly recoverable = true,
    public readonly details?: WireError['details'],
  ) {
    super(message);
    this.name = 'BrowserError';
  }
}
