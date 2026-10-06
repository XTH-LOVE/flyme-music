import { describe, expect, it, vi } from 'vitest';

describe('music request retry policy', () => {
  it('retries a transient endpoint failure before giving up', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { requestMusicApiJSON } = await import('./provider-utils');
    const result = await requestMusicApiJSON({ types: 'search', source: 'netease', name: 'test', count: 1, pages: 1 });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});

