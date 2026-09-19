import { describe, expect, it } from 'vitest';
import type { MusicTrack } from '@/music/source/types';
import {
  dedupeTracks,
  duplicateKey,
  exportFileName,
  exportPlaylist,
  filterTracks,
  findDuplicates,
  sortTracks,
  toJson,
  toM3U,
} from './playlistTools';

function track(over: Partial<MusicTrack> & { id: string }): MusicTrack {
  return {
    name: 'Song ' + over.id,
    artist: ['Artist'],
    album: 'Album',
    pic_id: 'p',
    url_id: 'u',
    lyric_id: 'l',
    source: 'netease',
    duration: 200,
    ...over,
  };
}

describe('sortTracks', () => {
  const list = [
    track({ id: '1', name: 'Cherry', artist: ['B'], duration: 300 }),
    track({ id: '2', name: 'apple', artist: ['C'], duration: 100 }),
    track({ id: '3', name: 'Banana', artist: ['A'], duration: 200 }),
  ];

  it('treats "added" as the identity, not a sort', () => {
    // A playlist's own order is meaningful; sorting by it must not reorder.
    expect(sortTracks(list, 'added', 'asc').map((t) => t.id)).toEqual(['1', '2', '3']);
    expect(sortTracks(list, 'added', 'desc').map((t) => t.id)).toEqual(['3', '2', '1']);
  });

  it('sorts by title case-insensitively', () => {
    expect(sortTracks(list, 'title', 'asc').map((t) => t.name)).toEqual(['apple', 'Banana', 'Cherry']);
  });

  it('sorts by title descending', () => {
    expect(sortTracks(list, 'title', 'desc').map((t) => t.name)).toEqual(['Cherry', 'Banana', 'apple']);
  });

  it('sorts by artist', () => {
    expect(sortTracks(list, 'artist', 'asc').map((t) => t.artist[0])).toEqual(['A', 'B', 'C']);
  });

  it('sorts by duration numerically, not lexically', () => {
    // A string sort would put 100, 200, 300 correctly by luck here, so use
    // values where lexical and numeric disagree.
    const numeric = [
      track({ id: 'a', duration: 1000 }),
      track({ id: 'b', duration: 900 }),
      track({ id: 'c', duration: 100 }),
    ];
    expect(sortTracks(numeric, 'duration', 'asc').map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('puts unknown durations last in both directions', () => {
    // An unknown length is not zero seconds, so it should not lead the list.
    const withUnknown = [
      track({ id: 'known', duration: 120 }),
      track({ id: 'unknown', duration: 0 }),
      track({ id: 'also', duration: 60 }),
    ];
    expect(sortTracks(withUnknown, 'duration', 'asc').map((t) => t.id)).toEqual(['also', 'known', 'unknown']);
    expect(sortTracks(withUnknown, 'duration', 'desc').map((t) => t.id)).toEqual(['known', 'also', 'unknown']);
  });

  it('is stable for equal keys', () => {
    const tied = [
      track({ id: '1', artist: ['Same'] }),
      track({ id: '2', artist: ['Same'] }),
      track({ id: '3', artist: ['Same'] }),
    ];
    expect(sortTracks(tied, 'artist', 'asc').map((t) => t.id)).toEqual(['1', '2', '3']);
  });

  it('does not mutate the input', () => {
    const original = [...list];
    sortTracks(list, 'title', 'desc');
    expect(list).toEqual(original);
  });
});

describe('filterTracks', () => {
  const list = [
    track({ id: '1', name: '晴天', artist: ['周杰伦'], album: '叶惠美' }),
    track({ id: '2', name: 'Shape of You', artist: ['Ed Sheeran'], album: 'Divide' }),
  ];

  it('returns everything for an empty query', () => {
    expect(filterTracks(list, '')).toHaveLength(2);
    expect(filterTracks(list, '   ')).toHaveLength(2);
  });

  it('matches the title', () => {
    expect(filterTracks(list, '晴天').map((t) => t.id)).toEqual(['1']);
  });

  it('matches the artist', () => {
    expect(filterTracks(list, '周杰伦').map((t) => t.id)).toEqual(['1']);
  });

  it('matches the album', () => {
    expect(filterTracks(list, 'Divide').map((t) => t.id)).toEqual(['2']);
  });

  it('is case-insensitive', () => {
    expect(filterTracks(list, 'shape').map((t) => t.id)).toEqual(['2']);
  });

  it('returns nothing when there is no match', () => {
    expect(filterTracks(list, 'zzz')).toEqual([]);
  });
});

describe('duplicates', () => {
  const withDupes = [
    track({ id: '1', name: '晴天', artist: ['周杰伦'] }),
    track({ id: '2', name: '稻香', artist: ['周杰伦'] }),
    track({ id: '9', name: '晴天', artist: ['周杰伦'], source: 'qq' }), // same song, other source
    track({ id: '3', name: '晴天', artist: ['翻唱歌手'] }), // a cover, not a duplicate
  ];

  it('treats the same song from another source as a duplicate', () => {
    expect(duplicateKey(withDupes[0])).toBe(duplicateKey(withDupes[2]));
  });

  it('keeps covers by other artists apart', () => {
    expect(duplicateKey(withDupes[0])).not.toBe(duplicateKey(withDupes[3]));
  });

  it('finds the duplicated groups with their indices', () => {
    const groups = findDuplicates(withDupes);
    expect(groups).toHaveLength(1);
    expect(groups[0].indices).toEqual([0, 2]);
    expect(groups[0].label).toContain('晴天');
  });

  it('reports nothing for a clean list', () => {
    expect(findDuplicates([track({ id: '1' }), track({ id: '2', name: 'Other' })])).toEqual([]);
  });

  it('keeps the first occurrence and preserves order', () => {
    const result = dedupeTracks(withDupes);
    expect(result.map((t) => t.id)).toEqual(['1', '2', '3']);
  });

  it('is a no-op on a clean list', () => {
    const clean = [track({ id: '1' }), track({ id: '2', name: 'Other' })];
    expect(dedupeTracks(clean)).toHaveLength(2);
  });
});

describe('export', () => {
  const list = [
    track({ id: '1', name: '晴天', artist: ['周杰伦'], duration: 269 }),
    track({ id: '2', name: 'Shape of You', artist: ['Ed Sheeran'], duration: 233 }),
  ];

  it('writes a valid M3U header and EXTINF lines', () => {
    const m3u = toM3U(list, '我的歌单');
    const lines = m3u.split('\n');
    expect(lines[0]).toBe('#EXTM3U');
    expect(lines[1]).toBe('#PLAYLIST:我的歌单');
    expect(m3u).toContain('#EXTINF:269,周杰伦 - 晴天');
    expect(m3u).toContain('#EXTINF:233,Ed Sheeran - Shape of You');
  });

  it('rounds the M3U duration to whole seconds', () => {
    expect(toM3U([track({ id: 'x', duration: 199.6 })])).toContain('#EXTINF:200,');
  });

  it('numbers the text export', () => {
    const text = exportPlaylist(list, 'txt');
    expect(text.split('\n')[0]).toBe('1. 晴天 - 周杰伦');
    expect(text.split('\n')[1]).toBe('2. Shape of You - Ed Sheeran');
  });

  it('carries the source through the JSON export', () => {
    // Without the source the list cannot be looked up again on re-import.
    const parsed = JSON.parse(toJson(list, 'x')) as { tracks: Array<{ source: string; id: string }> };
    expect(parsed.tracks[0].source).toBe('netease');
    expect(parsed.tracks[0].id).toBe('1');
  });

  it('uses the right extension per format', () => {
    const now = new Date('2026-09-19T00:00:00Z');
    expect(exportFileName('我的歌单', 'm3u', now)).toBe('我的歌单-20260919.m3u');
    expect(exportFileName('我的歌单', 'json', now)).toBe('我的歌单-20260919.json');
  });

  it('strips characters a filesystem would reject', () => {
    const name = exportFileName('a/b:c*d?e"f<g>h|i', 'txt');
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('falls back to a usable name when the title is empty', () => {
    expect(exportFileName('   ', 'txt')).toMatch(/^playlist-\d{8}\.txt$/);
  });
});
