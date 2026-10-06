import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicTrack } from '@/music/source/types';

const h = vi.hoisted(() => ({
  search: vi.fn(),
  getUrl: vi.fn(),
}));

vi.mock('@/music/source/factory', () => ({
  getTrackProvider: (source: string) => ({ source, search: (...args: unknown[]) => h.search(source, ...args), getUrl: (...args: unknown[]) => h.getUrl(source, ...args) }),
}));

vi.mock('@/music/source/sourceHealth', () => ({
  sourcePriority: (sources: string[]) => sources,
}));

vi.mock('@/music/source/track-resolver', () => ({
  resolveTrackUrl: (track: MusicTrack) => h.getUrl(track.source, track),
}));

const { searchForPlayback } = await import('./musicSearch');

const track = (source: MusicTrack['source'], name: string, artist = 'Artist'): MusicTrack => ({
  id: source + '-' + name,
  name,
  artist: [artist],
  album: 'Album',
  pic_id: '',
  url_id: '',
  lyric_id: '',
  source,
  duration: 200,
});

describe('playback source policy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses a Netease original without querying Hi歌', async () => {
    h.search.mockImplementation(async (source: string) => ({ items: source === 'netease' ? [track('netease', '晴天')] : [], hasMore: false }));
    const result = await searchForPlayback('晴天', 4, 'Artist');
    expect(result.source).toBe('netease');
    expect(result.usedFallback).toBe(false);
    expect(h.search).toHaveBeenCalledTimes(1);
    expect(h.search).toHaveBeenCalledWith('netease', '晴天', 1, 12);
  });

  it('falls back to Hi歌 only when Netease has no original', async () => {
    h.search.mockImplementation(async (source: string) => ({ items: source === 'netease' ? [track('netease', '晴天 翻唱')] : [track('higequ', '晴天')], hasMore: false }));
    const result = await searchForPlayback('晴天', 4, 'Artist');
    expect(result.source).toBe('higequ');
    expect(result.usedFallback).toBe(true);
    expect(h.search).toHaveBeenCalledTimes(2);
    expect(h.search.mock.calls.map((call) => call[0])).toEqual(['netease', 'higequ']);
  });

  it('falls back to Hi歌 when the Netease result has no playable URL', async () => {
    h.search.mockImplementation(async (source: string) => ({ items: [track(source as MusicTrack['source'], '晴天')], hasMore: false }));
    h.getUrl.mockImplementation(async (source: string) => source === 'higequ' ? 'https://audio.example/qingtian.mp3' : null);
    const result = await searchForPlayback('晴天', 4, 'Artist', [], { primary: 'netease', fallbacks: ['higequ'], validatePlayable: true });
    expect(result.source).toBe('higequ');
    expect(result.usedFallback).toBe(true);
    expect(h.getUrl.mock.calls.map((call) => call[0])).toEqual(['netease', 'higequ']);
  });
});
