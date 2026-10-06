import type { MusicTrack } from '@/music/source/types';
import { resolveTrackPic, resolveTrackUrl } from '@/music/source/track-resolver';
import { fetchLyricLines } from '@/utils/currentLyric';
import { bitrateForQuality } from '@/music/source/quality';
import { useSettingsStore } from '@/store/useSettingsStore';
import { isMeteredConnection } from '@/audio/analysis/background';

/**
 * Warm the resources that are needed immediately after the current song.
 *
 * This deliberately has no UI side effects. The resolver owns its TTL caches,
 * so a prefetch is just a low-priority cache fill and never replaces the
 * track that is currently playing.
 */
let generation = 0;
const MAX_LOOKAHEAD = 2;
export interface PrefetchStatus {
  key: string;
  state: 'queued' | 'ready' | 'partial' | 'failed';
  audio: boolean;
  cover: boolean;
  lyrics: boolean;
  updatedAt: number;
}

const statusCache = new Map<string, PrefetchStatus>();

function key(track: MusicTrack): string {
  return `${track.source}:${track.id}:${track.url_id}`;
}

export function prefetchUpcoming(
  queue: MusicTrack[],
  currentIndex: number,
  lookahead = MAX_LOOKAHEAD,
  options: { wrapAround?: boolean } = {},
): void {
  const token = ++generation;
  const br = bitrateForQuality(useSettingsStore.getState().quality);
  const forward = queue
    .slice(currentIndex + 1);
  const wrapped = options.wrapAround && currentIndex >= queue.length - 1
    ? queue.slice(0, Math.max(0, lookahead))
    : [];
  const upcoming = forward
    .concat(wrapped)
    .filter((track, index, list) => list.findIndex((candidate) => key(candidate) === key(track)) === index)
    .slice(0, Math.max(0, lookahead));

  // Resource resolution still consumes metered data even before an audio
  // element starts buffering. Covers and lyrics are useful on cellular only
  // when the user explicitly reaches the song, so skip the detached warm-up.
  if (isMeteredConnection()) return;

  // Do not await from the transport path: a slow provider must never delay
  // starting the current song.
  void Promise.all(
    upcoming.map(async (track) => {
      const trackKey = key(track);
      const status: PrefetchStatus = {
        key: trackKey,
        state: 'queued',
        audio: false,
        cover: false,
        lyrics: false,
        updatedAt: Date.now(),
      };
      statusCache.set(trackKey, status);
      const results = await Promise.allSettled([
        resolveTrackUrl(track, br),
        resolveTrackPic(track, 500),
        fetchLyricLines(track),
      ]);
      if (token !== generation) return false;
      status.audio = results[0].status === 'fulfilled' && Boolean(results[0].value);
      status.cover = results[1].status === 'fulfilled' && Boolean(results[1].value);
      status.lyrics = results[2].status === 'fulfilled' && results[2].value.length > 0;
      status.state = status.audio && status.cover && status.lyrics
        ? 'ready'
        : status.audio || status.cover || status.lyrics
          ? 'partial'
          : 'failed';
      status.updatedAt = Date.now();
      statusCache.set(trackKey, { ...status });
      // Reading the token here makes the cancellation contract explicit and
      // prevents future post-prefetch work from running for stale queues.
      return token === generation;
    }),
  );
}

export function cancelPrefetch(): void {
  generation += 1;
}

export function getPrefetchStatus(track: MusicTrack): PrefetchStatus | null {
  const status = statusCache.get(key(track));
  return status ? { ...status } : null;
}

export function clearPrefetchStatus(): void {
  statusCache.clear();
}
