import type { MusicTrack } from '@/music/source/types';
import { sourceHealth, sourceInCooldown } from '@/music/source/sourceHealth';
import { getLyricDiagnostics } from '@/utils/currentLyric';
import { getPrefetchStatus } from '@/player/playbackPrefetch';
import { isTrackCached } from '@/library/offlineCache';
import { getDownloadQueueSummary } from '@/utils/downloadQueue';
import { getTrackUrlError } from '@/music/source/track-resolver';

export interface PlaybackDiagnostics {
  track: { source: string; id: string; title: string } | null;
  source: {
    failures: number;
    inCooldown: boolean;
    lastFailure: number;
    lastSuccess: number;
  } | null;
  lyrics: ReturnType<typeof getLyricDiagnostics>;
  prefetch: ReturnType<typeof getPrefetchStatus>;
  cached: boolean;
  downloads: ReturnType<typeof getDownloadQueueSummary>;
  urlError: ReturnType<typeof getTrackUrlError>;
}

/**
 * Read-only diagnostics shared by support screens and future debug exports.
 * It deliberately performs no network request; the only async work is the
 * IndexedDB cache lookup.
 */
export async function collectPlaybackDiagnostics(
  track: MusicTrack | null,
): Promise<PlaybackDiagnostics> {
  if (!track) {
    return {
      track: null,
      source: null,
      lyrics: null,
      prefetch: null,
      cached: false,
      downloads: getDownloadQueueSummary(),
      urlError: null,
    };
  }
  const health = sourceHealth(track.source);
  return {
    track: { source: track.source, id: track.id, title: track.name },
    source: {
      failures: health.failures,
      inCooldown: sourceInCooldown(track.source),
      lastFailure: health.lastFailure,
      lastSuccess: health.lastSuccess,
    },
    lyrics: getLyricDiagnostics(track),
    prefetch: getPrefetchStatus(track),
    cached: await isTrackCached(track),
    downloads: getDownloadQueueSummary(),
    urlError: getTrackUrlError(track),
  };
}
