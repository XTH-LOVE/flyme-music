import { create } from 'zustand';
import type { MusicTrack } from '@/music/source/types';

/**
 * User playlists - ported from Otter Music's playlist slice
 * (create / rename / delete / add / remove / reorder, persisted).
 */
export interface UserPlaylist {
  id: string;
  name: string;
  tracks: MusicTrack[];
  createdAt: number;
  update_time: number;
  description?: string;
}

interface PlaylistState {
  playlists: UserPlaylist[];
  createPlaylist: (name: string) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addTrack: (playlistId: string, track: MusicTrack) => void;
  addBatch: (playlistId: string, tracks: MusicTrack[]) => void;
  /** Accepts the track itself: removal matches by source:id, never bare id. */
  removeTrack: (playlistId: string, track: Pick<MusicTrack, 'id' | 'source'>) => void;
  reorderTracks: (playlistId: string, tracks: MusicTrack[]) => void;
  /** Bulk rehydrate (cloud sync / backup restore). */
  hydratePlaylists: (playlists: UserPlaylist[]) => void;
}

const STORAGE_KEY = 'aurora.playlists';

function load(): UserPlaylist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserPlaylist[]) : [];
  } catch {
    return [];
  }
}

function persist(playlists: UserPlaylist[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
  } catch {
    /* ignore */
  }
}

function uuid(): string {
  return 'pl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

const trackKey = (t: MusicTrack) => t.source + ':' + t.id;

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: load(),

  createPlaylist: (name) => {
    const id = uuid();
    const next: UserPlaylist[] = [
      { id, name: name.trim() || '新歌单', tracks: [], createdAt: Date.now(), update_time: Date.now() },
      ...get().playlists,
    ];
    persist(next);
    set({ playlists: next });
    return id;
  },

  deletePlaylist: (id) => {
    const next = get().playlists.filter((p) => p.id !== id);
    persist(next);
    set({ playlists: next });
  },

  renamePlaylist: (id, name) => {
    const next = get().playlists.map((p) =>
      p.id === id ? { ...p, name: name.trim() || p.name, update_time: Date.now() } : p,
    );
    persist(next);
    set({ playlists: next });
  },

  addTrack: (playlistId, track) => {
    const next = get().playlists.map((p) => {
      if (p.id !== playlistId) return p;
      if (p.tracks.some((t) => trackKey(t) === trackKey(track))) return p;
      return {
        ...p,
        tracks: [...p.tracks, { ...track, update_time: Date.now() }],
        update_time: Date.now(),
      };
    });
    persist(next);
    set({ playlists: next });
  },

  addBatch: (playlistId, tracks) => {
    const next = get().playlists.map((p) => {
      if (p.id !== playlistId) return p;
      const existing = new Set(p.tracks.map(trackKey));
      const merged = [...p.tracks, ...tracks.filter((t) => !existing.has(trackKey(t)))];
      return { ...p, tracks: merged, update_time: Date.now() };
    });
    persist(next);
    set({ playlists: next });
  },

  removeTrack: (playlistId, track) => {
    const next = get().playlists.map((p) =>
      p.id === playlistId
        ? {
            ...p,
            tracks: p.tracks.filter((t) => !(t.id === track.id && t.source === track.source)),
            update_time: Date.now(),
          }
        : p,
    );
    persist(next);
    set({ playlists: next });
  },

  reorderTracks: (playlistId, tracks) => {
    const next = get().playlists.map((p) =>
      p.id === playlistId ? { ...p, tracks, update_time: Date.now() } : p,
    );
    persist(next);
    set({ playlists: next });
  },

  hydratePlaylists: (playlists) => {
    persist(playlists);
    set({ playlists });
  },
}));
