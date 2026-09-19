import type { MusicTrack } from '@/music/source/types';
import { analyzeTrack } from './analyzeTrack';
import { readCachedCard } from './cache';
import { trackKeyOf, type FeatureCard } from './types';

/**
 * How long a track must actually be playing before it is worth analysing.
 *
 * Analysis downloads and decodes the whole file. Doing that for every track the
 * user skips past would waste bandwidth on exactly the songs they did not want.
 */
export const BACKGROUND_DELAY_MS = 15_000;

let inFlight: { key: string; controller: AbortController } | null = null;

/** True when the user has asked to conserve data (mobile, metered). */
function dataSaverOn(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(conn?.saveData);
}

export function cancelBackgroundAnalysis(): void {
  inFlight?.controller.abort();
  inFlight = null;
}

export function isAnalyzing(): boolean {
  return inFlight !== null;
}

/**
 * Analyse a track quietly in the background so the local feature index grows
 * without the user ever asking.
 *
 * This is what makes sound-based similarity and the taste profile possible at
 * all: those need a body of analysed tracks, and requiring the user to trigger
 * analysis by hand would leave the pool permanently near-empty.
 *
 * Never throws and never surfaces UI: it is opportunistic work. Failures are
 * silent by design - a track that cannot be analysed is simply absent from the
 * index, which every consumer already handles.
 */
export async function analyzeInBackground(
  track: MusicTrack,
  onDone?: (card: FeatureCard) => void,
): Promise<FeatureCard | null> {
  if (dataSaverOn()) return null;

  const key = trackKeyOf(track);
  if (await readCachedCard(key)) return null; // already indexed
  if (inFlight) return null; // one at a time; never compete with playback

  const controller = new AbortController();
  inFlight = { key, controller };
  try {
    const card = await analyzeTrack(track, { signal: controller.signal });
    if (card) onDone?.(card);
    return card;
  } catch {
    return null;
  } finally {
    if (inFlight?.key === key) inFlight = null;
  }
}
