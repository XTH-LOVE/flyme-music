import { describe, expect, it } from 'vitest';
import { MusicRequestError, classifyMusicRequestError } from './requestError';

describe('music request errors', () => {
  it('classifies timeout and server failures as retryable', () => {
    expect(classifyMusicRequestError(new Error('request timeout')).code).toBe('timeout');
    expect(classifyMusicRequestError(new Error('fetch failed')).retryable).toBe(true);
    expect(new MusicRequestError('permission-denied', 'forbidden').retryable).toBe(false);
  });

  it('keeps authentication expiry distinct from permission denial', () => {
    expect(new MusicRequestError('auth-expired', '登录失效').code).toBe('auth-expired');
    expect(new MusicRequestError('permission-denied', '无权访问').code).toBe('permission-denied');
  });
});
