import { useEffect } from 'react';
import { playerController } from '@/player';
import { fetchLyricLines } from '@/utils/currentLyric';
import { resolveTrackPic } from '@/music/source/track-resolver';

/** Load an image into the browser cache so the <img> render is instant. */
function preloadImage(url: string | null | undefined): void {
  if (!url) return;
  const img = new Image();
  img.src = url;
}

/**
 * Warm the caches the moment a track starts: lyrics for the current song and
 * cover art for the current + next song. By the time the UI asks, the data
 * is usually already there.
 *
 * Also preloads the actual image bytes (not just the URL) so the browser
 * already has the decoded bitmap when TrackCover renders.
 */
export function usePrefetch(): void {
  useEffect(() => {
    let lastKey = '';
    const warm = () => {
      const snap = playerController.snapshot();
      const cur = snap.current;
      if (!cur) return;
      const key = cur.source + ':' + cur.id;
      if (key === lastKey) return;
      lastKey = key;
      void fetchLyricLines(cur);
      void resolveTrackPic(cur).then(preloadImage);
      const next = snap.queue[snap.queueIndex + 1];
      if (next) void resolveTrackPic(next).then(preloadImage);
    };
    warm();
    return playerController.subscribe(warm);
  }, []);
}
