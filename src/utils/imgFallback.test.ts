// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { initialImgStage, markDirectFailed } from './imgFallback';

/**
 * A CDN fails for a whole host, not for one artwork. Verifying that one failed
 * cover puts the rest of the page onto the proxy instead of making each of them
 * repeat the stalling attempt.
 */
describe('imgFallback host-level failure tracking', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const netease = (id: string) => 'https://p2.music.126.net/AAAA==/' + id + '.jpg?param=300y300';

  it('starts on direct for a fresh URL', () => {
    expect(initialImgStage(netease('1'))).toBe('direct');
  });

  it('sends the same URL to the proxy after it fails', () => {
    markDirectFailed(netease('1'));
    expect(initialImgStage(netease('1'))).toBe('proxy');
  });

  it('sends other artwork on the same host to the proxy too', () => {
    markDirectFailed(netease('1'));
    // This is the fix: before, every new cover retried the dead CDN and hung.
    expect(initialImgStage(netease('2'))).toBe('proxy');
  });

  it('leaves a different host on direct', () => {
    markDirectFailed(netease('1'));
    expect(initialImgStage('https://other-cdn.example.com/x.jpg')).toBe('direct');
  });

  it('handles unparseable URLs without throwing', () => {
    expect(initialImgStage('not-a-url')).toBe('direct');
    expect(() => markDirectFailed('not-a-url')).not.toThrow();
  });

  it('ignores empty input', () => {
    expect(initialImgStage(null)).toBe('direct');
    expect(() => markDirectFailed(undefined)).not.toThrow();
  });
});
