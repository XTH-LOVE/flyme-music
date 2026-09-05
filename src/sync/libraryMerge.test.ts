import { describe, expect, it } from 'vitest';
import { mergeLibrary, snapshotsEqual } from './libraryMerge';
import type { MusicTrack } from '@/music/source/types';
import type { PlayLogEntry } from '@/store/useLibraryStore';
import type { UserPlaylist } from '@/store/usePlaylistStore';

const tr = (id: string, source: MusicTrack['source'] = 'netease'): MusicTrack => ({
  id,
  name: 'song ' + id,
  artist: ['artist'],
  album: '',
  pic_id: id,
  url_id: id,
  lyric_id: id,
  source,
});
const log = (key: string, ts: number): PlayLogEntry => ({ key, name: key, artist: 'a', ts });
const pl = (id: string, update_time: number, name = 'pl ' + id): UserPlaylist => ({
  id,
  name,
  tracks: [],
  createdAt: 1,
  update_time,
});

describe('mergeLibrary', () => {
  it('unions favorites without duplicates, local order first', () => {
    const merged = mergeLibrary(
      { favorites: ['1', '2'], recentTracks: [], playLog: [], playlists: [] },
      { favorites: ['2', '3'], recentTracks: [], playLog: [], playlists: [] },
    );
    expect(merged.favorites).toEqual(['1', '2', '3']);
  });

  it('merges recent tracks by source:id with local priority and caps', () => {
    const local = { favorites: [], recentTracks: [tr('1', 'netease')], playLog: [], playlists: [] };
    // qq:1 and netease:1 are different tracks (source-scoped identity) - both stay.
    const cloud = { favorites: [], recentTracks: [tr('1', 'qq'), tr('2', 'netease')], playLog: [], playlists: [] };
    const merged = mergeLibrary(local, cloud);
    expect(merged.recentTracks.map((t) => t.source + ':' + t.id)).toEqual(['netease:1', 'qq:1', 'netease:2']);
  });

  it('dedupes the play log by key+ts and sorts newest first', () => {
    const merged = mergeLibrary(
      { favorites: [], recentTracks: [], playLog: [log('a', 100), log('b', 50)], playlists: [] },
      { favorites: [], recentTracks: [], playLog: [log('a', 100), log('c', 200)], playlists: [] },
    );
    expect(merged.playLog.map((e) => e.key)).toEqual(['c', 'a', 'b']);
  });

  it('resolves playlist edits by update_time and appends cloud-only ones', () => {
    const merged = mergeLibrary(
      { favorites: [], recentTracks: [], playLog: [], playlists: [pl('p1', 10, '旧名')] },
      { favorites: [], recentTracks: [], playLog: [], playlists: [pl('p1', 20, '新名'), pl('p2', 5)] },
    );
    expect(merged.playlists.map((p) => p.name)).toEqual(['新名', 'pl p2']);
  });

  it('keeps the local playlist rename when it is newer', () => {
    const merged = mergeLibrary(
      { favorites: [], recentTracks: [], playLog: [], playlists: [pl('p1', 99, '本地改名')] },
      { favorites: [], recentTracks: [], playLog: [], playlists: [pl('p1', 10, '云端旧名')] },
    );
    expect(merged.playlists[0].name).toBe('本地改名');
  });
});

describe('snapshotsEqual', () => {
  const base = { favorites: ['1'], recentTracks: [], playLog: [], playlists: [] };
  it('detects equality and favorite additions', () => {
    expect(snapshotsEqual(base, { ...base })).toBe(true);
    expect(snapshotsEqual(base, { ...base, favorites: ['1', '2'] })).toBe(false);
  });
});
