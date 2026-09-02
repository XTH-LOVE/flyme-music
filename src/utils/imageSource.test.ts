import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function okImage(): Response {
  return new Response(new Blob(['img-bytes']), { status: 200 });
}

describe('fetchImageBlob (browser branch)', () => {
  it('prefers the direct CORS fetch when the CDN allows it', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return okImage();
    }));
    const { fetchImageBlob } = await import('./imageSource');
    const blob = await fetchImageBlob('https://p3.music.126.net/a.jpg?param=300y300');
    expect(blob).toBeTruthy();
    expect(calls[0].startsWith('https://p3.music.126.net/')).toBe(true);
    expect(calls.some((c) => c.includes('/api/img'))).toBe(false);
  });

  it('falls back to /api/img when the direct CORS fetch fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (calls.length === 1) throw new TypeError('Failed to fetch');
      return okImage();
    }));
    const { fetchImageBlob } = await import('./imageSource');
    const blob = await fetchImageBlob('https://y.qq.com/c.jpg');
    expect(blob).toBeTruthy();
    expect(calls).toHaveLength(2);
    expect(calls[1].startsWith('/api/img?url=')).toBe(true);
  });

  it('falls back to /api/img when the direct fetch returns a non-ok status', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return calls.length === 1 ? new Response('', { status: 403 }) : okImage();
    }));
    const { fetchImageBlob } = await import('./imageSource');
    const blob = await fetchImageBlob('https://y.qq.com/c.jpg');
    expect(blob).toBeTruthy();
    expect(calls[1].startsWith('/api/img?url=')).toBe(true);
  });

  it('dedupes concurrent and repeat requests for the same url', async () => {
    let networkCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      networkCalls += 1;
      return okImage();
    }));
    const { fetchImageBlob } = await import('./imageSource');
    const url = 'https://p3.music.126.net/same.jpg?param=300y300';
    const [a, b] = await Promise.all([fetchImageBlob(url), fetchImageBlob(url)]);
    await fetchImageBlob(url);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(networkCalls).toBe(1);
  });
});
