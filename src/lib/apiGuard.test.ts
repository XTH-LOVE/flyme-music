import { describe, expect, it } from 'vitest';
import { hostOf, isAllowedProxyTarget, isAllowedRequest, rateLimit } from './apiGuard';

describe('hostOf', () => {
  it('extracts a lowercased host and keeps explicit ports', () => {
    expect(hostOf('https://Aurora.Example.com/path?q=1')).toBe('aurora.example.com');
    expect(hostOf('http://localhost:5173/x')).toBe('localhost:5173');
    expect(hostOf('tauri://localhost')).toBe('localhost');
  });

  it('returns null for junk and the literal "null" origin', () => {
    expect(hostOf('null')).toBeNull();
    expect(hostOf('not a url')).toBeNull();
    expect(hostOf('')).toBeNull();
  });
});

describe('isAllowedRequest', () => {
  const base = { host: 'aurora.example.com', extraAllowed: [] as string[] };

  it('accepts same-origin evidence via Origin or Referer', () => {
    expect(isAllowedRequest({ ...base, origin: 'https://aurora.example.com', referer: null })).toBe(true);
    expect(isAllowedRequest({ ...base, origin: null, referer: 'https://aurora.example.com/stats' })).toBe(true);
  });

  it('accepts the Tauri webview origin on any deployment', () => {
    expect(isAllowedRequest({ ...base, origin: 'tauri://localhost', referer: null })).toBe(true);
    expect(isAllowedRequest({ ...base, origin: 'http://tauri.localhost', referer: null })).toBe(true);
  });

  it('accepts loopback origins only when the request was served from loopback', () => {
    const local = { host: 'localhost:5173', extraAllowed: [] as string[] };
    expect(isAllowedRequest({ ...local, origin: 'http://localhost:5173', referer: null })).toBe(true);
    expect(isAllowedRequest({ ...local, origin: null, referer: 'http://127.0.0.1:5173/ai' })).toBe(true);
    // A public deployment must not honour a forged loopback Origin/Referer.
    expect(isAllowedRequest({ ...base, origin: 'http://localhost:5173', referer: null })).toBe(false);
    expect(isAllowedRequest({ ...base, origin: null, referer: 'http://127.0.0.1:5173/ai' })).toBe(false);
  });

  it('rejects foreign origins and missing evidence', () => {
    expect(isAllowedRequest({ ...base, origin: 'https://evil.com', referer: null })).toBe(false);
    expect(isAllowedRequest({ ...base, origin: null, referer: 'https://evil.com/hotlink' })).toBe(false);
    expect(isAllowedRequest({ ...base, origin: null, referer: null })).toBe(false);
    expect(isAllowedRequest({ ...base, origin: 'null', referer: null })).toBe(false);
    expect(isAllowedRequest({ host: '', origin: 'https://aurora.example.com', referer: null, extraAllowed: [] })).toBe(false);
  });

  it('honours the extra allowlist with or without a scheme', () => {
    const extra = ['https://partner.example.org', 'Mirror.Example.net'];
    expect(isAllowedRequest({ ...base, origin: 'https://partner.example.org', referer: null, extraAllowed: extra })).toBe(true);
    expect(isAllowedRequest({ ...base, origin: 'https://mirror.example.net', referer: null, extraAllowed: extra })).toBe(true);
    expect(isAllowedRequest({ ...base, origin: 'https://other.example.org', referer: null, extraAllowed: extra })).toBe(false);
  });
});

describe('isAllowedProxyTarget', () => {
  it('rejects IPv4-mapped IPv6 targets, including alternate URL spellings', () => {
    expect(isAllowedProxyTarget('http://[::ffff:127.0.0.1]/')).toBe(false);
    expect(isAllowedProxyTarget('http://[::ffff:7f00:1]/')).toBe(false);
    expect(isAllowedProxyTarget('http://[::ffff:192.168.1.10]/')).toBe(false);
  });

  it('continues to allow public HTTP(S) targets on standard ports', () => {
    expect(isAllowedProxyTarget('https://music.example.com/api')).toBe(true);
    expect(isAllowedProxyTarget('http://203.0.113.10/')).toBe(true);
  });

  it('supports purpose-specific upstream allowlists', () => {
    expect(isAllowedProxyTarget('https://c.y.qq.com/api', 'proxy')).toBe(true);
    expect(isAllowedProxyTarget('https://evil.example/api', 'proxy')).toBe(false);
    expect(isAllowedProxyTarget('https://cdn.example/cover.jpg', 'image', ['cdn.example'])).toBe(true);
    expect(isAllowedProxyTarget('https://cdn.example/song.mp3', 'media')).toBe(false);
  });

  it('rejects oversized proxy URLs', () => {
    expect(isAllowedProxyTarget('https://c.y.qq.com/' + 'x'.repeat(4096), 'proxy')).toBe(false);
  });
});

describe('rateLimit', () => {
  it('allows up to the limit then blocks until the window resets', () => {
    const now = 1_000_000;
    expect(rateLimit('t:1.2.3.4', 3, 60_000, now)).toBe(true);
    expect(rateLimit('t:1.2.3.4', 3, 60_000, now)).toBe(true);
    expect(rateLimit('t:1.2.3.4', 3, 60_000, now)).toBe(true);
    expect(rateLimit('t:1.2.3.4', 3, 60_000, now)).toBe(false);
    expect(rateLimit('t:1.2.3.4', 3, 60_000, now + 60_001)).toBe(true);
  });

  it('tracks keys independently', () => {
    const now = 2_000_000;
    expect(rateLimit('t:a', 1, 60_000, now)).toBe(true);
    expect(rateLimit('t:a', 1, 60_000, now)).toBe(false);
    expect(rateLimit('t:b', 1, 60_000, now)).toBe(true);
  });
});
