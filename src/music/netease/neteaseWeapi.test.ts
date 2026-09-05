import { afterEach, describe, expect, it, vi } from 'vitest';

// 纯 node 环境：isTauri() 为 false，neteaseWeapi 走 fetch 分支。
function envelope(json: unknown): Response {
  return new Response(JSON.stringify({ body: JSON.stringify(json), cookies: [] }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('neteaseWeapi risk-control retry', () => {
  it('retries once with a fresh identity when Netease answers -462', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input));
      const cookie = JSON.parse(String(init?.body)).cookie as string;
      expect(cookie).toContain('_ntes_nuid=');
      return envelope(calls.length === 1 ? { code: -462 } : { code: 200, data: 'ok' });
    }));
    const { neteaseWeapi } = await import('./neteaseWeapi');
    const r = await neteaseWeapi<{ code: number; data?: string }>('/weapi/v3/playlist/detail', { id: 1 });
    expect(r.json.code).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('does not retry a healthy response', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return envelope({ code: 200, data: 'ok' });
    }));
    const { neteaseWeapi } = await import('./neteaseWeapi');
    const r = await neteaseWeapi<{ code: number }>('/weapi/personalized/playlist', {});
    expect(r.json.code).toBe(200);
    expect(calls).toBe(1);
  });

  it('returns the last risk-control answer without throwing when retries exhaust', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return envelope({ code: -462 });
    }));
    const { neteaseWeapi } = await import('./neteaseWeapi');
    const r = await neteaseWeapi<{ code: number }>('/weapi/v3/playlist/detail', { id: 1 });
    expect(r.json.code).toBe(-462);
    expect(calls).toBe(2);
  });
});
