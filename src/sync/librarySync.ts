import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { mergeLibrary, snapshotsEqual, type LibrarySnapshot } from './libraryMerge';
import { notify } from '@/utils/notify';
import type { MusicTrack } from '@/music/source/types';

/**
 * Cross-device library sync over the `user_library` snapshot table.
 * Pull-merge-push on login, then a debounced push whenever local stores move.
 * The pure merge lives in libraryMerge.ts (tested); this module is only IO.
 */

const PUSH_DEBOUNCE_MS = 4000;

let started = false;
let applyingRemote = false;
let pushing = false;
let pushTimer: number | null = null;

function localSnapshot(): LibrarySnapshot {
  const lib = useLibraryStore.getState();
  return {
    // Whole tracks, not ids: this is the only column the favourites travel in,
    // and ids alone cannot rebuild the list on another device.
    favorites: lib.favoriteTracks,
    favoriteSongIds: lib.favoriteSongIds,
    recentTracks: lib.recentTracks,
    playLog: lib.playLog,
    // Full tracks, not just ids. Ids alone cannot rebuild the favourites list
    // on another device - the heart would light up from the id while the list
    // stayed empty, which is what was reported.
    favoriteTracks: lib.favoriteTracks,
    playlists: usePlaylistStore.getState().playlists,
  };
}

function applySnapshot(snapshot: LibrarySnapshot): void {
  applyingRemote = true;
  try {
    useLibraryStore.getState().hydrateLibrary({
      recentTracks: snapshot.recentTracks,
      favoriteTracks: snapshot.favoriteTracks,
      // Kept as well: the hearts read ids, and a snapshot from an older client
      // carries only those. Newer snapshots carry tracks in `favorites`, so the
      // ids are derived from whichever shape arrived.
      favoriteSongIds: idsFrom(snapshot),
      playLog: snapshot.playLog,
    });
    usePlaylistStore.getState().hydratePlaylists(snapshot.playlists);
  } finally {
    applyingRemote = false;
  }
}

/** The ids, whichever shape the snapshot was written in. */
function idsFrom(snapshot: LibrarySnapshot): string[] {
  if (snapshot.favoriteSongIds?.length) return snapshot.favoriteSongIds;
  if (snapshot.favoriteTracks?.length) return snapshot.favoriteTracks.map((t) => t.id);
  return snapshot.favorites.filter((v): v is string => typeof v === 'string');
}

function rowToSnapshot(row: Record<string, unknown>): LibrarySnapshot {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const favorites = arr(row.favorites);
  // Rows written before this change hold bare ids; rows written after hold
  // whole tracks. Both are read, so an account that has been around does not
  // lose its favourites the first time it syncs with the new build.
  const ids = favorites.filter((v): v is string => typeof v === 'string');
  const tracks = favorites.filter(
    (v): v is MusicTrack => typeof v === 'object' && v !== null,
  );
  return {
    favorites: ids.length ? ids : tracks.map((t) => t.id),
    favoriteSongIds: ids.length ? ids : tracks.map((t) => t.id),
    favoriteTracks: tracks,
    recentTracks: arr(row.recent_tracks) as LibrarySnapshot['recentTracks'],
    playLog: arr(row.play_log) as LibrarySnapshot['playLog'],
    playlists: arr(row.playlists) as LibrarySnapshot['playlists'],
  };
}

async function hasSession(): Promise<boolean> {
  if (!supabaseConfigured || !supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

async function pushSnapshot(snapshot: LibrarySnapshot): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId || !supabase) return;
  pushing = true;
  try {
    await supabase.from('user_library').upsert({
      user_id: userId,
      favorites: snapshot.favorites,
      recent_tracks: snapshot.recentTracks,
      play_log: snapshot.playLog,
      playlists: snapshot.playlists,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* sync is best-effort; local data stays authoritative */
  } finally {
    pushing = false;
  }
}

/** Pull the cloud row, merge both ways, apply locally and converge the cloud. */
export async function syncLibraryNow(): Promise<void> {
  if (!(await hasSession())) return;
  try {
    const userId = useAuthStore.getState().user!.id;
    const { data, error } = await supabase!
      .from('user_library')
      .select('favorites, recent_tracks, play_log, playlists')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return;
    const local = localSnapshot();
    const cloud = data ? rowToSnapshot(data as Record<string, unknown>) : null;
    if (!cloud) {
      await pushSnapshot(local);
      return;
    }
    const merged = mergeLibrary(local, cloud);
    if (!snapshotsEqual(local, merged)) {
      applySnapshot(merged);
      notify('曲库已从云端同步');
    }
    if (!snapshotsEqual(cloud, merged)) {
      await pushSnapshot(merged);
    }
  } catch {
    /* offline or permission issue - stay local */
  }
}

function schedulePush(): void {
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    if (!pushing) void pushSnapshot(localSnapshot());
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Start syncing once a session appears. Call once from AppLayout; harmless
 * when Supabase is not configured (pure local mode).
 */
export function startLibrarySync(): void {
  if (started || !supabaseConfigured || !supabase) return;
  started = true;

  const beginIfLoggedIn = () => {
    if (!useAuthStore.getState().user) return false;
    void syncLibraryNow();
    useLibraryStore.subscribe(() => {
      if (!applyingRemote) schedulePush();
    });
    usePlaylistStore.subscribe(() => {
      if (!applyingRemote) schedulePush();
    });
    return true;
  };

  if (beginIfLoggedIn()) return;
  useAuthStore.subscribe(() => {
    beginIfLoggedIn();
  });
}
