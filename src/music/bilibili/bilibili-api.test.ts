import { describe, expect, it } from 'vitest';
import { cleanTitle, normalizeCover, parseDuration, selectAudioUrl } from './bilibili-api';
import { ALLOWED_PATHS } from '@/lib/bilibiliServer';

/**
 * Bilibili's search payload is HTML-escaped and wraps matches in <em> tags, and
 * its durations are strings. Both are easy to get subtly wrong and impossible to
 * notice in a passing build.
 */
describe('cleanTitle', () => {
  it('strips the keyword highlight tags bilibili injects', () => {
    expect(cleanTitle('周杰伦 <em class="keyword">晴天</em> 完整版')).toBe('周杰伦 晴天 完整版');
  });

  it('decodes HTML entities', () => {
    expect(cleanTitle('A &amp; B')).toBe('A & B');
    expect(cleanTitle('&lt;live&gt;')).toBe('<live>');
    expect(cleanTitle('&quot;quoted&quot;')).toBe('"quoted"');
    expect(cleanTitle('it&#39;s')).toBe("it's");
  });

  it('trims surrounding whitespace', () => {
    expect(cleanTitle('  hello  ')).toBe('hello');
  });

  it('handles an empty or missing title', () => {
    expect(cleanTitle('')).toBe('');
  });
});

describe('parseDuration', () => {
  it('parses m:ss', () => {
    expect(parseDuration('4:12')).toBe(252);
  });

  it('parses h:mm:ss', () => {
    expect(parseDuration('1:02:03')).toBe(3723);
  });

  it('handles a bare number of seconds', () => {
    expect(parseDuration('252')).toBe(252);
    expect(parseDuration(252)).toBe(252);
  });

  it('returns 0 for missing or malformed input', () => {
    // 0 means "unknown" downstream, so it must not be NaN or a crash.
    for (const input of [undefined, '', 'abc', '1:xx']) {
      expect(parseDuration(input as string | undefined), String(input)).toBe(0);
    }
  });

  it('does not treat 0 seconds as invalid', () => {
    expect(parseDuration(0)).toBe(0);
  });
});

describe('normalizeCover', () => {
  it('adds the scheme to protocol-relative URLs', () => {
    // Bilibili returns "//i0.hdslb.com/..." which is not a usable src.
    expect(normalizeCover('//i0.hdslb.com/bfs/archive/x.jpg')).toBe('https://i0.hdslb.com/bfs/archive/x.jpg');
  });

  it('leaves absolute URLs alone', () => {
    expect(normalizeCover('https://i0.hdslb.com/x.jpg')).toBe('https://i0.hdslb.com/x.jpg');
  });

  it('returns an empty string when there is no cover', () => {
    expect(normalizeCover(undefined)).toBe('');
    expect(normalizeCover('')).toBe('');
  });
});

describe('selectAudioUrl', () => {
  const track = (id: number, bandwidth: number, url = 'https://cdn/' + id) => ({
    id,
    bandwidth,
    baseUrl: url,
  });

  it('picks the highest bandwidth rendition', () => {
    // Bilibili returns several; the element can play any, so take the best.
    expect(selectAudioUrl([track(30216, 64000), track(30280, 192000), track(30232, 128000)])).toBe(
      'https://cdn/30280',
    );
  });

  it('accepts the snake_case field name too', () => {
    expect(selectAudioUrl([{ base_url: 'https://cdn/snake', bandwidth: 1 }])).toBe('https://cdn/snake');
  });

  it('ignores entries without a url', () => {
    expect(selectAudioUrl([{ id: 1, bandwidth: 999 }, track(2, 100)])).toBe('https://cdn/2');
  });

  it('returns null when nothing is playable', () => {
    expect(selectAudioUrl([])).toBeNull();
    expect(selectAudioUrl([{ id: 1, bandwidth: 100 }])).toBeNull();
  });

  it('still returns a url when bandwidth is missing', () => {
    expect(selectAudioUrl([{ baseUrl: 'https://cdn/only' }])).toBe('https://cdn/only');
  });
});

/**
 * The relay forwards to bilibili on the caller's behalf, so the path whitelist is
 * what keeps it from becoming an open proxy to bilibili.com.
 */
describe('relay whitelist', () => {
  it('allows exactly the endpoints the client needs', () => {
    expect([...ALLOWED_PATHS].sort()).toEqual([
      '/x/player/playurl',
      '/x/player/v2',
      '/x/web-interface/search/type',
      '/x/web-interface/view',
    ]);
  });

  it('does not allow anything else', () => {
    for (const path of ['/x/space/arc/search', '/x/credit/history', '/x/web-interface/nav', '']) {
      expect(ALLOWED_PATHS.has(path), path).toBe(false);
    }
  });
});
