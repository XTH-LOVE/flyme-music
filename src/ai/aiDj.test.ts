import { describe, expect, it } from 'vitest';
import { buildDjSet } from './aiDj';
import type { MusicTrack } from '@/music/source/types';

const track = (id: string, name: string, artist: string): MusicTrack => ({ id, name, artist: [artist], album: '', pic_id: id, url_id: id, lyric_id: id, source: 'mock' });

describe('ai dj', () => {
  it('builds a staged, deduplicated set', async () => {
    const set = await buildDjSet('15分钟学习音乐', async (query) => [track(query + '-1', 'A', 'A'), track(query + '-2', 'B', 'B'), track(query + '-3', 'C', 'C')]);
    expect(set.plan.goal).toBe('study');
    expect(set.tracks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(set.tracks.map((item) => item.id)).size).toBe(set.tracks.length);
  });
});

