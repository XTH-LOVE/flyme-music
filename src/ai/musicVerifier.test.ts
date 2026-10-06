import { describe, expect, it } from 'vitest';
import { verifyMusicCandidates } from './musicVerifier';
import type { MusicTrack } from '@/music/source/types';

const track = (id: string, artist: string, name = id): MusicTrack => ({ id, name, artist: [artist], album: 'A', pic_id: '', url_id: '', lyric_id: '', source: 'mock', duration: 180 });

describe('music verifier', () => {
  it('filters duplicates, forbidden terms and repeated artists', () => {
    const result = verifyMusicCandidates([track('1', 'A'), track('2', 'A'), track('3', 'B', 'Avoid Me'), track('1', 'A')], { avoid: ['avoid'], maxArtistRepeat: 1 });
    expect(result.tracks.map((item) => item.id)).toEqual(['1']);
    expect(result.rejected).toBe(3);
    expect(result.reasons.join(' ')).toContain('艺人重复');
  });
});
