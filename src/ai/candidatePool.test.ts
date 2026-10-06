import { describe, expect, it } from 'vitest';
import { createCandidatePool, pickBestCandidate } from './candidatePool';
import type { MusicTrack } from '@/music/source/types';

const track = (id: string, name: string, artist = 'A'): MusicTrack => ({ id, name, artist: [artist], album: '', pic_id: id, url_id: id, lyric_id: id, source: 'mock' });

describe('candidate pool', () => {
  it('deduplicates and avoids disliked tracks', () => {
    const pool = createCandidatePool('夜晚 爵士', [track('1', '夜晚爵士'), track('1', '夜晚爵士'), track('2', '快乐流行', 'Bad')], ['Bad']);
    expect(pool.candidates).toHaveLength(2);
    expect(pool.candidates[1].score).toBeLessThan(0);
  });

  it('picks the best unselected candidate', () => {
    const pool = createCandidatePool('夜晚', [track('1', '夜晚'), track('2', '白天')]);
    expect(pickBestCandidate(pool)?.track.id).toBe('1');
  });
});

