import { create } from 'zustand';
import type { MusicTrack } from '@/music/source/types';

const MAX_RECENT = 30;
const MAX_HISTORY = 12;
const MAX_PLAY_LOG = 500;

export interface PlayLogEntry {
  key: string;
  name: string;
  artist: string;
  ts: number;
  /** A replayable snapshot. Older local records may not have it yet. */
  track?: MusicTrack;
}

interface LibraryState {
  recentSongIds: string[];
  /** Full track snapshots - works for online & local tracks alike. */
  recentTracks: MusicTrack[];
  favoriteSongIds: string[];
  /**
   * The favourites themselves, as full tracks.
   *
   * IDs alone cannot be resolved back into a song: `Song` has no source field,
   * and `songToTrack` hardcodes `source: 'mock'`, so the only provider that
   * could answer `getSongs(ids)` is the mock one. A song liked from netease or
   * QQ would be stored, never found, and never appear. Storing the track is
   * what `recentTracks` already does for the same reason.
   */
  favoriteTracks: MusicTrack[];
  searchHistory: string[];
  /** Timestamped play log feeding the stats / listening-calendar page. */
  playLog: PlayLogEntry[];
  playSong: (songId: string) => void;
  recordTrack: (track: MusicTrack) => void;
  toggleFavorite: (track: MusicTrack) => void;
  addSearchKeyword: (keyword: string) => void;
  removeSearchKeyword: (keyword: string) => void;
  clearSearchHistory: () => void;
  /** Wipes the play log and the "recently played" strip it feeds. */
  clearPlayLog: () => void;
  /** Bulk rehydrate (cloud sync / backup restore), persisting each slice. */
  hydrateLibrary: (patch: {
    recentTracks?: MusicTrack[];
    favoriteTracks?: MusicTrack[];
    favoriteSongIds?: string[];
    playLog?: PlayLogEntry[];
  }) => void;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const trackKey = (t: MusicTrack) => t.source + ':' + t.id;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  recentSongIds: load('aurora.recent', [] as string[]),
  recentTracks: load('aurora.recentTracks.v1', [] as MusicTrack[]),
  favoriteSongIds: load('aurora.favorites', [] as string[]),
  favoriteTracks: load('aurora.favoriteTracks.v1', [] as MusicTrack[]),
  searchHistory: load('aurora.searchHistory', [] as string[]),
  playLog: load('aurora.playLog.v1', [] as PlayLogEntry[]),

  playSong: (songId) => {
    const next = [songId, ...get().recentSongIds.filter((id) => id !== songId)].slice(
      0,
      MAX_RECENT,
    );
    save('aurora.recent', next);
    set({ recentSongIds: next });
  },

  recordTrack: (track) => {
    const current = get().recentTracks;
    const next = [
      track,
      ...current.filter((t) => trackKey(t) !== trackKey(track)),
    ].slice(0, MAX_RECENT);
    save('aurora.recentTracks.v1', next);

    const log = get().playLog;
    const entry: PlayLogEntry = {
      key: trackKey(track),
      name: track.name,
      artist: track.artist.join(' / '),
      ts: Date.now(),
      track,
    };
    const nextLog = [entry, ...log].slice(0, MAX_PLAY_LOG);
    save('aurora.playLog.v1', nextLog);

    set({ recentTracks: next, playLog: nextLog });
  },

  toggleFavorite: (track) => {
    const current = get().favoriteTracks;
    const liked = current.some((t) => t.id === track.id);
    // The full track goes in, not just its id - see the field's comment.
    const nextTracks = liked ? current.filter((t) => t.id !== track.id) : [track, ...current];
    // Kept in sync because the heart state is read as a plain id lookup in
    // several places; deriving it here means there is one source of truth.
    const nextIds = nextTracks.map((t) => t.id);
    save('aurora.favoriteTracks.v1', nextTracks);
    save('aurora.favorites', nextIds);
    set({ favoriteTracks: nextTracks, favoriteSongIds: nextIds });
  },

  addSearchKeyword: (keyword) => {
    const kw = keyword.trim();
    if (!kw) return;
    const next = [kw, ...get().searchHistory.filter((k) => k !== kw)].slice(
      0,
      MAX_HISTORY,
    );
    save('aurora.searchHistory', next);
    set({ searchHistory: next });
  },

  removeSearchKeyword: (keyword) => {
    const next = get().searchHistory.filter((k) => k !== keyword);
    save('aurora.searchHistory', next);
    set({ searchHistory: next });
  },

  clearSearchHistory: () => {
    save('aurora.searchHistory', []);
    set({ searchHistory: [] });
  },

  clearPlayLog: () => {
    // recentTracks is derived from the same play activity, so clearing one
    // without the other would leave the Home "recently played" strip showing
    // tracks that no longer exist in the history.
    save('aurora.playLog.v1', []);
    save('aurora.recentTracks.v1', []);
    set({ playLog: [], recentTracks: [] });
  },

  hydrateLibrary: (patch) => {
    const next: Partial<LibraryState> = {};
    if (patch.recentTracks) {
      save('aurora.recentTracks.v1', patch.recentTracks.slice(0, MAX_RECENT));
      next.recentTracks = patch.recentTracks.slice(0, MAX_RECENT);
    }
    if (patch.favoriteTracks) {
      save('aurora.favoriteTracks.v1', patch.favoriteTracks);
    }
    if (patch.favoriteSongIds) {
      save('aurora.favorites', patch.favoriteSongIds);
      next.favoriteSongIds = patch.favoriteSongIds;
    }
    if (patch.playLog) {
      save('aurora.playLog.v1', patch.playLog.slice(0, MAX_PLAY_LOG));
      next.playLog = patch.playLog.slice(0, MAX_PLAY_LOG);
    }
    if (Object.keys(next).length) set(next);
  },
}));
