import { describe, expect, it } from 'vitest';
import { dedupeCanonicalTracks, mergeMusicEntities } from './musicEntity';
import type { MusicTrack } from '@/music/source/types';

const base = (source: MusicTrack['source'], id: string, name = 'Song'): MusicTrack => ({ id, name, artist: ['Artist'], album: 'Album', pic_id: '', url_id: '', lyric_id: '', source });

describe('music entities', () => {
  it('merges equivalent provider versions into one entity', () => {
    expect(mergeMusicEntities([base('qq', '1'), base('netease', '2')])).toHaveLength(1);
    expect(dedupeCanonicalTracks([base('qq', '1'), base('netease', '2')])[0].source).toBe('netease');
  });
});
