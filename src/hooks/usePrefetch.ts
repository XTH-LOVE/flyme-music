import { useEffect } from 'react';
import { playerController, type PlaybackStatus } from '@/player';
import { fetchLyricLines } from '@/utils/currentLyric';
import { resolveTrackPic, resolveTrackUrl } from '@/music/source/track-resolver';
import { bitrateForQuality } from '@/music/source/quality';
import { useSettingsStore } from '@/store/useSettingsStore';
import { isMeteredConnection } from '@/audio/analysis/background';
import { withPicSize } from '@/utils/imgFallback';

/**
 * Load an image into the browser cache so the <img> render is instant.
 * The URL must be the EXACT one the player will display: TrackCover shows
 * withPicSize(url, '500y500') for priority covers, so preloading the raw
 * URL downloads a multi-megabyte original that never matches the cache key
 * of the 500px thumbnail actually rendered - pure wasted bandwidth.
 */
function preloadPriorityImage(url: string | null | undefined): void {
  if (!url) return;
  const img = new Image();
  img.src = withPicSize(url, '500y500') || url;
}

/**
 * Start warming the next track this many seconds before the current one ends.
 *
 * The whole point is to win a race: the player resolves the next stream URL and
 * starts fetching the moment the current track ends, and bytes already in the
 * media cache turn that into near-instant audio. Starting earlier only spends
 * bandwidth on tracks the user may still skip.
 */
export const AUDIO_PREFETCH_LEAD_SECONDS = 30;

/**
 * Whether it is time to warm the next track.
 *
 * Pure so the boundary is pinned down: too early wastes data on a track the
 * user may skip, too late and the prefetch loses the race it exists to win.
 */
export function shouldPrefetchNext(input: {
  status: PlaybackStatus;
  duration: number;
  currentTime: number;
  hasNext: boolean;
}): boolean {
  if (!input.hasNext || input.status !== 'playing') return false;
  if (!(input.duration > 0)) return false;
  const remaining = input.duration - input.currentTime;
  return remaining > 0 && remaining <= AUDIO_PREFETCH_LEAD_SECONDS;
}

/**
 * One detached element is deliberately kept referenced.
 *
 * An unreferenced media element can be collected mid-buffer, and the point here
 * is that the bytes are already in the media cache when the player asks for the
 * same URL seconds later - not that this element ever plays. Only one preload is
 * kept alive at a time: starting a new one abandons the previous download rather
 * than leaving two running.
 */
let audioPreloader: HTMLAudioElement | null = null;

export function preloadAudioBytes(url: string | null | undefined): void {
  if (!url) return;
  if (audioPreloader) {
    audioPreloader.removeAttribute('src');
    audioPreloader.load();
  }
  const el = new Audio();
  el.preload = 'auto';
  el.muted = true;
  el.src = url;
  el.load();
  audioPreloader = el;
}

/**
 * Warm what the UI is about to need.
 *
 * On each track change: lyrics for the current song and cover art for the
 * current + next song, including the image bytes themselves.
 *
 * Once the current track is close to its end: the next track's stream URL and
 * audio bytes. Without it the transition is dead air while the player resolves
 * the URL and waits for the first bytes - the engine covers that with its
 * simulated clock, so the progress bar keeps moving while nothing is audible.
 *
 * This is not sample-accurate gapless playback; that needs two audio elements
 * swapping under the engine, which is a change to the playback core rather than
 * to prefetching. Warming the cache removes the network wait, which is the
 * larger half of the gap.
 */
export function usePrefetch(): void {
  useEffect(() => {
    let lastKey = '';
    let prefetchedFor = '';

    const warm = () => {
      const snap = playerController.snapshot();
      const cur = snap.current;
      if (!cur) return;
      const key = cur.source + ':' + cur.id;
      const next = snap.queue[snap.queueIndex + 1];

      // Once per track: lyrics and artwork.
      if (key !== lastKey) {
        lastKey = key;
        prefetchedFor = '';
        void fetchLyricLines(cur);
        void resolveTrackPic(cur).then(preloadPriorityImage);
        if (next) void resolveTrackPic(next).then(preloadPriorityImage);
      }

      // On every tick, so the lead time is measured rather than assumed.
      if (!next || prefetchedFor === key) return;
      if (!shouldPrefetchNext({
        status: snap.status,
        duration: snap.duration,
        currentTime: snap.currentTime,
        hasNext: true,
      })) {
        return;
      }
      // Honour the connection, but not the analysis setting: this is playback
      // latency, not an index-building background job.
      if (isMeteredConnection()) return;
      prefetchedFor = key;
      // The same bitrate the player will ask for - the resolved URL is cached
      // per bitrate, so a different one warms an entry nothing will read.
      const br = bitrateForQuality(useSettingsStore.getState().quality);
      void resolveTrackUrl(next, br).then(preloadAudioBytes);
    };

    warm();
    return playerController.subscribe(warm);
  }, []);
}
