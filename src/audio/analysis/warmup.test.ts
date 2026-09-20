import { describe, expect, it } from 'vitest';
import type { MusicTrack } from '@/music/source/types';
import { WARMUP_BUDGET, warmupCandidates } from './warmup';
import { trackKeyOf } from './types';

function track(id: string, over: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id,
    name: 'Song ' + id,
    artist: ['Artist'],
    album: 'Album',
    pic_id: 'p',
    url_id: 'u',
    lyric_id: 'l',
    source: 'netease',
    ...over,
  };
}

describe('warmupCandidates', () => {
  it('takes everything when the library is small', () => {
    const list = [track('a'), track('b'), track('c')];
    expect(warmupCandidates(list, new Set())).toHaveLength(3);
  });

  it('stops at the budget', () => {
    const list = Array.from({ length: 40 }, (_, i) => track('s' + i));
    expect(warmupCandidates(list, new Set())).toHaveLength(WARMUP_BUDGET);
  });

  it('honours a custom budget', () => {
    const list = Array.from({ length: 40 }, (_, i) => track('s' + i));
    expect(warmupCandidates(list, new Set(), 5)).toHaveLength(5);
    expect(warmupCandidates(list, new Set(), 0)).toHaveLength(0);
  });

  it('keeps the list order', () => {
    const list = [track('a'), track('b'), track('c')];
    expect(warmupCandidates(list, new Set(), 2).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('skips tracks that are already indexed', () => {
    const list = [track('a'), track('b'), track('c')];
    const cached = new Set([trackKeyOf(list[0]), trackKeyOf(list[1])]);
    expect(warmupCandidates(list, cached).map((t) => t.id)).toEqual(['c']);
  });

  it('spends the whole budget on new material, not on cached tracks', () => {
    // The regression this guards: filtering after the cap would hand a run of
    // already-indexed tracks to the analyser and produce nothing.
    const list = Array.from({ length: 20 }, (_, i) => track('s' + i));
    const cached = new Set(list.slice(0, 10).map(trackKeyOf));
    expect(warmupCandidates(list, cached, 5).map((t) => t.id)).toEqual([
      's10',
      's11',
      's12',
      's13',
      's14',
    ]);
  });

  it('does not queue the same track twice', () => {
    // `trackKeyOf` includes source, id, name and artist, so two entries with the
    // same identity are the same row as far as the cache is concerned.
    const list = [track('a'), track('a'), track('b')];
    expect(warmupCandidates(list, new Set()).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('keeps same-id tracks from different sources apart', () => {
    const list = [track('1', { source: 'netease' }), track('1', { source: 'qq' })];
    expect(warmupCandidates(list, new Set())).toHaveLength(2);
  });

  it('returns nothing for an empty library', () => {
    expect(warmupCandidates([], new Set())).toEqual([]);
  });
});
