import { describe, expect, it } from 'vitest';
import { hostOf, isAllowedRequest, rateLimit } from './apiGuard';

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

  it('accepts Tauri webview and vite dev origins', () => {
    expect(isAllowedRequest({ ...base, origin: 'tauri://localhost', referer: null })).toBe(true);
    expect(isAllowedRequest({ ...base, origin: 'http://tauri.localhost', referer: null })).toBe(true);
    expect(isAllowedRequest({ ...base, origin: 'http://localhost:5173', referer: null })).toBe(true);
    expect(isAllowedRequest({ ...base, origin: null, referer: 'http://127.0.0.1:5173/ai' })).toBe(true);
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
