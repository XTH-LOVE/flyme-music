import { describe, expect, it } from 'vitest';
import { isAllowedProxyTarget, isHttpUrl, sanitizeProxyContentType } from './apiGuard';

/**
 * The proxies fetch whatever URL the caller supplies. Before this guard the only
 * check was the scheme, so any host and any port could be reached - an open
 * relay, and on the plain-Node deployment an SSRF path to internal addresses
 * (Cloudflare happens to block those, but the same code runs on Vercel too).
 */
describe('isAllowedProxyTarget', () => {
  it('allows ordinary public URLs', () => {
    expect(isAllowedProxyTarget('https://music-api.gdstudio.xyz/api.php?x=1')).toBe(true);
    expect(isAllowedProxyTarget('http://example.com/a.jpg')).toBe(true);
    expect(isAllowedProxyTarget('https://p2.music.126.net/x.jpg?param=300y300')).toBe(true);
  });

  it('rejects non-http schemes', () => {
    expect(isAllowedProxyTarget('file:///etc/passwd')).toBe(false);
    expect(isAllowedProxyTarget('ftp://example.com/x')).toBe(false);
    expect(isAllowedProxyTarget('data:text/html,<script>x</script>')).toBe(false);
    expect(isHttpUrl('data:text/html,x')).toBe(false);
  });

  it('rejects loopback in every spelling', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://127.0.0.1:8080/',
      'http://localhost/',
      'http://LOCALHOST/',
      'http://foo.localhost/',
      'http://[::1]/',
      'http://2130706433/', // decimal encoding of 127.0.0.1
    ]) {
      expect(isAllowedProxyTarget(url), url).toBe(false);
    }
  });

  it('rejects private and link-local ranges', () => {
    for (const url of [
      'http://10.0.0.1/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/', // cloud metadata
      'http://0.0.0.0/',
      'http://224.0.0.1/',
    ]) {
      expect(isAllowedProxyTarget(url), url).toBe(false);
    }
  });

  it('rejects IPv6 unique-local and link-local', () => {
    expect(isAllowedProxyTarget('http://[fd00::1]/')).toBe(false);
    expect(isAllowedProxyTarget('http://[fe80::1]/')).toBe(false);
  });

  it('rejects internal-looking hostnames', () => {
    expect(isAllowedProxyTarget('http://service.internal/')).toBe(false);
    expect(isAllowedProxyTarget('http://printer.local/')).toBe(false);
  });

  it('rejects unusual ports and embedded credentials', () => {
    expect(isAllowedProxyTarget('http://example.com:22/')).toBe(false);
    expect(isAllowedProxyTarget('http://example.com:6379/')).toBe(false);
    expect(isAllowedProxyTarget('http://user:pass@example.com/')).toBe(false);
    // Standard ports stay allowed.
    expect(isAllowedProxyTarget('https://example.com:443/x')).toBe(true);
  });

  it('accepts a public IP that merely looks private-adjacent', () => {
    expect(isAllowedProxyTarget('http://172.32.0.1/')).toBe(true);
    expect(isAllowedProxyTarget('http://11.0.0.1/')).toBe(true);
  });
});

/**
 * Echoing the upstream Content-Type made a proxied third-party document come
 * back as text/html from our own origin - one navigation from same-origin
 * script. Clients only use .text()/.json(), so downgrading is free.
 */
describe('sanitizeProxyContentType', () => {
  it('downgrades HTML-ish types on the text proxy', () => {
    expect(sanitizeProxyContentType('text/html', 'text')).toBe('text/plain; charset=utf-8');
    expect(sanitizeProxyContentType('text/html; charset=utf-8', 'text')).toBe('text/plain; charset=utf-8');
    expect(sanitizeProxyContentType('application/xhtml+xml', 'text')).toBe('text/plain; charset=utf-8');
    expect(sanitizeProxyContentType('image/svg+xml', 'text')).toBe('text/plain; charset=utf-8');
    expect(sanitizeProxyContentType(null, 'text')).toBe('text/plain; charset=utf-8');
  });

  it('keeps JSON on the text proxy, since clients parse it', () => {
    expect(sanitizeProxyContentType('application/json', 'text')).toBe('application/json');
    expect(sanitizeProxyContentType('application/json; charset=utf-8', 'text')).toBe(
      'application/json; charset=utf-8',
    );
  });

  it('keeps real images on the image proxy', () => {
    expect(sanitizeProxyContentType('image/jpeg', 'image')).toBe('image/jpeg');
    expect(sanitizeProxyContentType('image/png', 'image')).toBe('image/png');
    expect(sanitizeProxyContentType('image/webp', 'image')).toBe('image/webp');
  });

  it('refuses SVG and non-images on the image proxy', () => {
    // SVG can carry script; the caller turns this into a 415.
    expect(sanitizeProxyContentType('image/svg+xml', 'image')).toBe('application/octet-stream');
    expect(sanitizeProxyContentType('text/html', 'image')).toBe('application/octet-stream');
    expect(sanitizeProxyContentType(null, 'image')).toBe('application/octet-stream');
  });

  it('keeps audio and video on the media proxy, refuses the rest', () => {
    expect(sanitizeProxyContentType('audio/mpeg', 'media')).toBe('audio/mpeg');
    expect(sanitizeProxyContentType('video/mp4', 'media')).toBe('video/mp4');
    expect(sanitizeProxyContentType('text/html', 'media')).toBe('application/octet-stream');
  });
});
