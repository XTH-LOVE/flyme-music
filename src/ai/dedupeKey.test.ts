import { describe, expect, it } from 'vitest';
import { dedupeKey } from './musicSearch';
import type { MusicTrack } from '@/music/source/types';

function track(name: string, artist: string[], id: string): MusicTrack {
  return {
    id,
    name,
    artist,
    album: '',
    pic_id: id,
    url_id: id,
    lyric_id: id,
    source: 'mock',
  };
}

/**
 * The same song can come back from several sources in aggregate search, so it
 * must collapse to a single row - including across pages, where page two can
 * surface from one source what page one already showed from another.
 */
describe('dedupeKey', () => {
  it('matches the same song from different sources', () => {
    const a = track('晴天', ['周杰伦'], '1');
    const b = track('晴天', ['周杰伦'], '999');
    expect(dedupeKey(a)).toBe(dedupeKey(b));
  });

  it('is insensitive to case and surrounding whitespace', () => {
    const a = track(' 晴天 ', ['周杰伦'], '1');
    const b = track('晴天', ['周杰伦'], '2');
    expect(dedupeKey(a)).toBe(dedupeKey(b));
  });

  it('keeps different songs apart', () => {
    expect(dedupeKey(track('晴天', ['周杰伦'], '1')).valueOf()).not.toBe(
      dedupeKey(track('七里香', ['周杰伦'], '2')).valueOf(),
    );
  });

  it('keeps the same title by a different artist apart (covers)', () => {
    const original = track('晴天', ['周杰伦'], '1');
    const cover = track('晴天', [' Someone '], '2');
    expect(dedupeKey(original)).not.toBe(dedupeKey(cover));
  });

  it('collapses a page-two result already shown on page one', () => {
    const pageOne = [track('晴天', ['周杰伦'], '1'), track('稻香', ['周杰伦'], '2')];
    const pageTwo = [
      track('晴天', ['周杰伦'], '77'), // same song, another source
      track('夜曲', ['周杰伦'], '3'),
      track('稻香', ['周杰伦'], '88'), // same song, another source
    ];
    const seen = new Set(pageOne.map(dedupeKey));
    const merged = [...pageOne, ...pageTwo.filter((t) => !seen.has(dedupeKey(t)))];
    expect(merged.map((t) => t.name)).toEqual(['晴天', '稻香', '夜曲']);
  });
});
