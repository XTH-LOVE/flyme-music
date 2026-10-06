export type MusicRequestErrorCode =
  | 'network'
  | 'timeout'
  | 'auth-expired'
  | 'permission-denied'
  | 'not-found'
  | 'server'
  | 'invalid-response'
  | 'cancelled'
  | 'unknown';

export class MusicRequestError extends Error {
  readonly code: MusicRequestErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly endpoint?: string;

  constructor(
    code: MusicRequestErrorCode,
    message: string,
    options: {
      status?: number;
      endpoint?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'MusicRequestError';
    this.code = code;
    this.status = options.status;
    this.endpoint = options.endpoint;
    this.retryable = code === 'network' || code === 'timeout' || code === 'server';
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function classifyMusicRequestError(error: unknown): MusicRequestError {
  if (error instanceof MusicRequestError) return error;
  if (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
  ) {
    return new MusicRequestError('cancelled', '请求已取消', { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|超时/i.test(message)) {
    return new MusicRequestError('timeout', '音乐接口请求超时', { cause: error });
  }
  if (/network|fetch|连接|网络/i.test(message)) {
    return new MusicRequestError('network', '音乐接口网络错误', { cause: error });
  }
  return new MusicRequestError('unknown', message || '音乐接口请求失败', { cause: error });
}
