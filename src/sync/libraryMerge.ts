import type { MusicTrack } from '@/music/source/types';
import type { PlayLogEntry } from '@/store/useLibraryStore';
import type { UserPlaylist } from '@/store/usePlaylistStore';

/**
 * Pure merge of a local and a cloud library snapshot. Both sides are treated
 * as authoritative for what they know; nothing the user did on either device
 * is silently dropped:
 *  - favorites: union (local order first, cloud-only appended)
 *  - recentTracks: dedupe by source:id, local order first, capped
 *  - playLog: dedupe by (key, ts), newest first, capped
 *  - playlists: match by id, the side with the newer update_time wins;
 *    cloud-only playlists are appended
 */

export interface LibrarySnapshot {
  favorites: string[];
  recentTracks: MusicTrack[];
  playLog: PlayLogEntry[];
  playlists: UserPlaylist[];
}

export const RECENT_CAP = 30;
export const PLAY_LOG_CAP = 500;

const trackKey = (t: MusicTrack) => t.source + ':' + t.id;

export function mergeLibrary(local: LibrarySnapshot, cloud: LibrarySnapshot): LibrarySnapshot {
  const favorites = [...new Set([...local.favorites, ...cloud.favorites])];

  const seenTracks = new Set(local.recentTracks.map(trackKey));
  const recentTracks = [...local.recentTracks, ...cloud.recentTracks.filter((t) => !seenTracks.has(trackKey(t)))]
    .slice(0, RECENT_CAP);

  const logKeys = new Set(local.playLog.map((e) => e.key + '@' + e.ts));
  const playLog = [...local.playLog, ...cloud.playLog.filter((e) => !logKeys.has(e.key + '@' + e.ts))]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, PLAY_LOG_CAP);

  const byId = new Map(local.playlists.map((p) => [p.id, p]));
  for (const cp of cloud.playlists) {
    const lp = byId.get(cp.id);
    if (!lp) byId.set(cp.id, cp);
    else if ((cp.update_time ?? 0) > (lp.update_time ?? 0)) byId.set(cp.id, cp);
  }
  // Keep local ordering, then append cloud-only playlists (newest first).
  const cloudOnly = cloud.playlists.filter((p) => !local.playlists.some((lp) => lp.id === p.id));
  const playlists = [...local.playlists.map((p) => byId.get(p.id)!), ...cloudOnly];

  return { favorites, recentTracks, playLog, playlists };
}

/** True when two snapshots differ in any tracked field. */
export function snapshotsEqual(a: LibrarySnapshot, b: LibrarySnapshot): boolean {
  const sameLists = (x: unknown[], y: unknown[]) =>
    x.length === y.length && x.every((v, i) => JSON.stringify(v) === JSON.stringify(y[i]));
  return (
    sameLists(a.favorites, b.favorites) &&
    sameLists(a.recentTracks, b.recentTracks) &&
    sameLists(a.playLog, b.playLog) &&
    sameLists(a.playlists, b.playlists)
  );
}
