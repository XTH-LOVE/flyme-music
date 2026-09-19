// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
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

/**
 * The two failure signals carry different amounts of information, and treating
 * them alike took every cover down: a lazy image below the fold never starts
 * loading, so a timeout fired on all of them, each marking the whole host, and
 * every subsequent cover was routed to a proxy that answers 403 to <img>.
 */
describe('imgFallback: timeouts must not condemn a whole host', () => {
  const cover = (id: string) => 'https://p2.music.126.net/AAAA==/' + id + '.jpg?param=300y300';

  /**
   * The failure map is module-level, and localStorage.clear() does not reset it.
   * Re-importing gives each case a clean slate, otherwise a host marked by an
   * earlier test leaks into this one.
   */
  async function fresh() {
    vi.resetModules();
    localStorage.clear();
    return await import('./imgFallback');
  }

  it('marks only the URL when the failure was a timeout', async () => {
    const mod = await fresh();
    mod.markDirectFailed(cover('1'), { host: false });
    // The slow image itself skips straight to the proxy next time...
    expect(mod.initialImgStage(cover('1'))).toBe('proxy');
    // ...but its neighbours still try the CDN, which is the point.
    expect(mod.initialImgStage(cover('2'))).toBe('direct');
  });

  it('marks the host when the CDN actually refused', async () => {
    // An error event is unambiguous evidence about the host, so it generalises.
    const mod = await fresh();
    mod.markDirectFailed(cover('1'), { host: true });
    expect(mod.initialImgStage(cover('2'))).toBe('proxy');
  });

  it('defaults to marking the host, so existing callers keep their behaviour', async () => {
    const mod = await fresh();
    mod.markDirectFailed(cover('3'));
    expect(mod.initialImgStage(cover('4'))).toBe('proxy');
  });
});
