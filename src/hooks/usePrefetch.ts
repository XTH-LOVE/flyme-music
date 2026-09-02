import { useEffect } from 'react';
import { playerController } from '@/player';
import { fetchLyricLines } from '@/utils/currentLyric';
import { resolveTrackPic } from '@/music/source/track-resolver';

/**
 * Warm the caches the moment a track starts: lyrics for the current song and
 * cover art for the current + next song. By the time the UI asks, the data
 * is usually already there.
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
      void resolveTrackPic(cur);
      const next = snap.queue[snap.queueIndex + 1];
      if (next) void resolveTrackPic(next);
    };
    warm();
    return playerController.subscribe(warm);
  }, []);
}
