import { describe, expect, it, vi } from 'vitest';

vi.mock('@/music/source/track-resolver', () => ({
  resolveTrackUrl: vi.fn(() => Promise.resolve('https://audio.test/song.mp3')),
  resolveTrackPic: vi.fn(() => Promise.resolve('https://audio.test/cover.jpg')),
}));
vi.mock('@/utils/currentLyric', () => ({
  fetchLyricLines: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/music/source/quality', () => ({
  bitrateForQuality: vi.fn(() => 320),
}));
vi.mock('@/store/useSettingsStore', () => ({
  useSettingsStore: { getState: () => ({ quality: 'high' }) },
}));

import { fetchLyricLines } from '@/utils/currentLyric';
import { resolveTrackPic, resolveTrackUrl } from '@/music/source/track-resolver';
import { getPrefetchStatus, prefetchUpcoming } from './playbackPrefetch';
import type { MusicTrack } from '@/music/source/types';

const track = (id: string): MusicTrack => ({
  id,
  name: id,
  artist: ['artist'],
  album: 'album',
  pic_id: id,
  url_id: id,
  lyric_id: id,
  source: 'netease',
});

describe('prefetchUpcoming', () => {
  it('warms the next two unique tracks without touching the current one', async () => {
    prefetchUpcoming([track('current'), track('next'), track('next'), track('later')], 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolveTrackUrl).toHaveBeenCalledTimes(2);
    expect(resolveTrackPic).toHaveBeenCalledTimes(2);
    expect(fetchLyricLines).toHaveBeenCalledTimes(2);
    expect(getPrefetchStatus(track('next'))?.state).toBe('partial');
  });

  it('wraps to the first track for repeat-all at the queue tail', async () => {
    prefetchUpcoming([track('current'), track('first')], 1, 1, { wrapAround: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolveTrackUrl).toHaveBeenCalledWith(track('current'), 320);
  });
});
