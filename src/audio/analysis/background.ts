import type { MusicTrack } from '@/music/source/types';
import { useSettingsStore } from '@/store/useSettingsStore';
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

interface NetworkInformation {
  saveData?: boolean;
  type?: string;
  effectiveType?: string;
}

function connection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

/**
 * Whether it is acceptable to spend the user's bandwidth right now.
 *
 * Analysing a track downloads the whole file, so this runs unattended only when
 * the connection looks unmetered. Both signals are honoured because neither is
 * universally supported: `saveData` is the user's explicit request, and
 * `type`/`effectiveType` catch mobile data where saveData may be unset.
 */
export function shouldSpendBandwidth(): { ok: boolean; reason?: 'disabled' | 'save_data' | 'metered' } {
  if (!useSettingsStore.getState().backgroundAnalysis) return { ok: false, reason: 'disabled' };
  const conn = connection();
  if (conn?.saveData) return { ok: false, reason: 'save_data' };
  if (conn?.type === 'cellular' || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') {
    return { ok: false, reason: 'metered' };
  }
  return { ok: true };
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
 * Because it downloads whole tracks it is gated on the user's setting and on the
 * connection being unmetered - an app that quietly spends someone's mobile data
 * to build its own index is not a trade they agreed to.
 *
 * Never throws and never surfaces UI: it is opportunistic work. Failures are
 * silent by design - a track that cannot be analysed is simply absent from the
 * index, which every consumer already handles.
 */
export async function analyzeInBackground(
  track: MusicTrack,
  onDone?: (card: FeatureCard) => void,
): Promise<FeatureCard | null> {
  if (!shouldSpendBandwidth().ok) return null;

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
