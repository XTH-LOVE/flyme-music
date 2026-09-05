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
  searchHistory: string[];
  /** Timestamped play log feeding the stats / listening-calendar page. */
  playLog: PlayLogEntry[];
  playSong: (songId: string) => void;
  recordTrack: (track: MusicTrack) => void;
  toggleFavorite: (songId: string) => void;
  addSearchKeyword: (keyword: string) => void;
  removeSearchKeyword: (keyword: string) => void;
  clearSearchHistory: () => void;
  /** Bulk rehydrate (cloud sync / backup restore), persisting each slice. */
  hydrateLibrary: (patch: {
    recentTracks?: MusicTrack[];
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

  toggleFavorite: (songId) => {
    const current = get().favoriteSongIds;
    const next = current.includes(songId)
      ? current.filter((id) => id !== songId)
      : [songId, ...current];
    save('aurora.favorites', next);
    set({ favoriteSongIds: next });
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

  hydrateLibrary: (patch) => {
    const next: Partial<LibraryState> = {};
    if (patch.recentTracks) {
      save('aurora.recentTracks.v1', patch.recentTracks.slice(0, MAX_RECENT));
      next.recentTracks = patch.recentTracks.slice(0, MAX_RECENT);
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
