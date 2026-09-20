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
export type BandwidthRefusal = 'save_data' | 'metered';

/**
 * Why this connection should not be spent on background work, if any.
 *
 * Split out from the setting check because it is a fact about the network
 * rather than a preference: the next-track audio prefetch honours this too,
 * while `backgroundAnalysis` only governs whether tracks get analysed.
 *
 * Both signals are honoured because neither is universally supported:
 * `saveData` is the user's explicit request, and `type`/`effectiveType` catch
 * mobile data where saveData may be unset.
 */
export function connectionRefusal(): BandwidthRefusal | null {
  const conn = connection();
  if (conn?.saveData) return 'save_data';
  if (conn?.type === 'cellular' || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') {
    return 'metered';
  }
  return null;
}

/** True when spending bandwidth here would come out of someone's data plan. */
export function isMeteredConnection(): boolean {
  return connectionRefusal() !== null;
}

export function shouldSpendBandwidth(): { ok: boolean; reason?: 'disabled' | BandwidthRefusal } {
  if (!useSettingsStore.getState().backgroundAnalysis) return { ok: false, reason: 'disabled' };
  const refusal = connectionRefusal();
  if (refusal) return { ok: false, reason: refusal };
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
