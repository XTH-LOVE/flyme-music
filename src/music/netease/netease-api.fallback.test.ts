import { afterEach, describe, expect, it, vi } from 'vitest';

// 纯 node 环境：isTauri() 为 false，全部走 fetch 分支。
afterEach(() => {
  vi.unstubAllGlobals();
});

function weapiEnvelope(json: unknown): Response {
  return new Response(JSON.stringify({ body: JSON.stringify(json), cookies: [] }), { status: 200 });
}

const LEGACY_DETAIL = {
  code: 200,
  result: {
    id: 666,
    name: '回退歌单',
    coverImgUrl: 'http://p3.music.126.net/x.jpg',
    description: '测试描述',
    playCount: 123,
    trackCount: 2,
    creator: { nickname: '测试创建者' },
    tracks: [
      { id: 1, name: '歌一', ar: [{ id: 10, name: '歌手甲' }], al: { id: 100, name: '专辑甲', picUrl: 'http://p3.music.126.net/a1.jpg' }, dt: 200000 },
      { id: 2, name: '歌二', ar: [{ id: 20, name: '歌手乙' }], al: { id: 200, name: '专辑乙', picUrl: 'http://p3.music.126.net/a2.jpg' }, dt: 180000 },
    ],
  },
};

describe('getNeteasePlaylistDetail legacy fallback', () => {
  it('falls back to the unencrypted public channel when weapi is risk-controlled', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (String(input).startsWith('/api/netease/weapi')) return weapiEnvelope({ code: -462 });
      if (String(input).startsWith('/api/netease/public')) return new Response(JSON.stringify(LEGACY_DETAIL), { status: 200 });
      throw new Error('unexpected call: ' + input);
    }));
    const { getNeteasePlaylistDetail } = await import('./netease-api');
    const detail = await getNeteasePlaylistDetail('666');
    expect(detail.meta.name).toBe('回退歌单');
    expect(detail.meta.creator).toBe('测试创建者');
    expect(detail.tracks).toHaveLength(2);
    expect(detail.tracks[0]).toMatchObject({ id: '1', name: '歌一', artist: ['歌手甲'], source: 'netease' });
    expect(calls.some((c) => c.startsWith('/api/netease/public'))).toBe(true);
  });

  it('keeps the original codeError when the fallback also fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/netease/weapi')) return weapiEnvelope({ code: -462 });
      return new Response(JSON.stringify({ code: -462 }), { status: 200 });
    }));
    const { getNeteasePlaylistDetail } = await import('./netease-api');
    await expect(getNeteasePlaylistDetail('666')).rejects.toThrow('网易云');
  });
});
