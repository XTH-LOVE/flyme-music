import type { MusicTrack } from '@/music/source/types';
import { analyzeInBackground, isAnalyzing, shouldSpendBandwidth } from './background';
import { listCachedCards } from './cache';
import { trackKeyOf } from './types';

/**
 * Pre-analysis after a library scan.
 *
 * Halcyon caches its library analysis and warms it as soon as a scan finishes,
 * so opening the statistics page on a large library is instant rather than
 * being the moment the work starts. The same applies here: the feature index
 * that sound similarity and the taste profile read is built from whole-file
 * downloads, so the only moment it is cheap to build is right after the user
 * has finished importing and is not waiting on anything.
 *
 * It is opportunistic work, like `analyzeInBackground`: never throws, never
 * surfaces UI, and stops the moment the user's settings or connection say the
 * bandwidth is not ours to spend.
 */

/** How many tracks one warmup run will attempt. */
export const WARMUP_BUDGET = 12;
/** Pause between tracks, so a scan cannot saturate the connection. */
export const WARMUP_GAP_MS = 1200;
/** How often to re-check whether the playback analyser has freed the slot. */
export const WARMUP_POLL_MS = 500;

/**
 * The tracks a warmup run should attempt, in order.
 *
 * Cached tracks are skipped before any work starts rather than being handed to
 * the analyser and rejected there, so the budget is spent on new material.
 */
export function warmupCandidates(
  tracks: readonly MusicTrack[],
  cached: ReadonlySet<string>,
  budget: number = WARMUP_BUDGET,
): MusicTrack[] {
  const picked: MusicTrack[] = [];
  const seen = new Set<string>();
  for (const track of tracks) {
    if (picked.length >= Math.max(0, budget)) break;
    const key = trackKeyOf(track);
    if (cached.has(key) || seen.has(key)) continue;
    seen.add(key);
    picked.push(track);
  }
  return picked;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Bumped by every run and by `cancelWarmup`, so a stale loop stops at once. */
let generation = 0;

/** Stops any warmup in progress. Safe to call when none is running. */
export function cancelWarmup(): void {
  generation += 1;
}

/**
 * Analyse up to `WARMUP_BUDGET` not-yet-indexed tracks, one at a time.
 *
 * Resolves with what it managed to do, so a caller that wants to report
 * progress can - the local library page does not, because a toast about
 * background indexing would be noise.
 */
export async function warmupAnalysis(
  tracks: readonly MusicTrack[],
): Promise<{ analysed: number; total: number }> {
  generation += 1;
  const mine = generation;

  // One read of the whole index rather than a lookup per track: the library can
  // hold thousands of rows and the cache is a single IndexedDB store.
  const cached = new Set((await listCachedCards()).map((card) => card.trackKey));
  const pending = warmupCandidates(tracks, cached);

  let analysed = 0;
  for (const track of pending) {
    if (generation !== mine) break;
    if (!shouldSpendBandwidth().ok) break;
    // Wait for the playback analyser rather than skipping past it: a warmup
    // that gave up whenever a song happened to be analysed would never finish
    // on a session where the user keeps playing music - which is all of them.
    while (isAnalyzing()) {
      if (generation !== mine) return { analysed, total: pending.length };
      await sleep(WARMUP_POLL_MS);
    }
    const card = await analyzeInBackground(track);
    if (card) analysed += 1;
    await sleep(WARMUP_GAP_MS);
  }

  return { analysed, total: pending.length };
}
