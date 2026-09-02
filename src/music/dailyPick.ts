import type { MusicTrack } from '@/music/source/types';
import type { PlayLogEntry } from '@/store/useLibraryStore';

/**
 * Local daily-recommendation engine (no external service).
 *
 * Strategy:
 *  1. Rank the user's recent listening (playLog) into top artists + top songs.
 *  2. Drop anything the user disliked (artist name or keyword hit).
 *  3. Rank artist/keyword queries by listening weight, dedupe, and expose them
 *     for the caller to feed into the source search (`getTrackProvider().search`).
 *
 * The heavy lifting (network search) stays in the React layer; this module only
 * decides *what* to look for and *how* to score/filter the results, which keeps
 * it pure and unit-testable.
 */

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface DailyPickInput {
  playLog: PlayLogEntry[];
  favorites: string[]; // favorited track keys (source:id) or bare ids
  dislikes: string[];
  now?: number;
}

export interface RankedQuery {
  query: string;
  weight: number;
}

/** Normalise text for loose matching (dislikes, artist equality). */
export const norm = (s: string): string =>
  s.toLowerCase().replace(/[\s\(\)（）《》.,!?'"·/\\-]/g, '');

export function isDisliked(text: string, dislikes: string[]): boolean {
  if (!dislikes.length) return false;
  const t = norm(text);
  return dislikes.some((d) => {
    const nd = norm(d);
    return nd.length > 0 && (t.includes(nd) || nd.includes(t));
  });
}

/** Artist name, split-track helpers (playLog stores "A / B" joined artists). */
export function splitArtists(artistText: string): string[] {
  return artistText.split('/').map((x) => x.trim()).filter(Boolean);
}

export interface DailyPickSignals {
  /** Artist names ranked by recent plays (desc). */
  topArtists: string[];
  /** Song names ranked by recent plays (desc). */
  topSongs: string[];
  /** Search queries (artists + top-song artists) ranked by weight, deduped. */
  queries: RankedQuery[];
}

export function analyzeListening(input: DailyPickInput): DailyPickSignals {
  const now = input.now ?? Date.now();
  const windowStart = now - RECENT_WINDOW_MS;

  const plays = input.playLog.filter((e) => e.ts >= windowStart);

  const artistCount = new Map<string, number>();
  const songCount = new Map<string, number>();

  for (const e of plays) {
    for (const a of splitArtists(e.artist)) {
      if (isDisliked(a, input.dislikes)) continue;
      artistCount.set(a, (artistCount.get(a) ?? 0) + 1);
    }
    if (!isDisliked(e.name, input.dislikes) && !isDisliked(e.artist, input.dislikes)) {
      songCount.set(e.name, (songCount.get(e.name) ?? 0) + 1);
    }
  }

  const topArtists = [...artistCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 8);

  const topSongs = [...songCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 8);

  // Query pool: search the top artists. Weight = play count.
  const queryMap = new Map<string, number>();
  for (const [artist, count] of artistCount.entries()) queryMap.set(artist, count);

  const queries: RankedQuery[] = [...queryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([query, weight]) => ({ query, weight }));

  return { topArtists, topSongs, queries };
}

/** The playLog keys a track has already appeared under (for dedupe). */
export function knownTrackKeys(playLog: PlayLogEntry[]): Set<string> {
  return new Set(playLog.map((e) => e.key));
}

/** Scoring for a search result: prefer not-listened, not-disliked tracks. */
export function scoreCandidate(
  track: MusicTrack,
  known: Set<string>,
  dislikes: string[],
): number {
  const key = track.source + ':' + track.id;
  if (known.has(key)) return -1; // already played — never surface first
  if (isDisliked(track.name, dislikes)) return -1;
  if (track.artist.some((a) => isDisliked(a, dislikes))) return -1;
  return 1;
}

/** Filter + sort a batch of search results, keeping only fresh, safe tracks. */
export function filterCandidates(
  tracks: MusicTrack[],
  known: Set<string>,
  dislikes: string[],
): MusicTrack[] {
  const seen = new Set<string>();
  const out: MusicTrack[] = [];
  for (const t of tracks) {
    const key = t.source + ':' + t.id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (scoreCandidate(t, known, dislikes) < 0) continue;
    out.push(t);
  }
  return out;
}
