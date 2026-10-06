import { useEffect } from 'react';
import { playerController } from '@/player';
import { useLibraryStore } from '@/store/useLibraryStore';
import { notifyNowPlaying } from '@/utils/nowPlayingNotify';
import { logListeningEvent } from '@/ai/listeningEvents';
import type { MusicTrack } from '@/music/source/types';

/** Records every newly playing track (online or local) into recent history. */
export function usePlaybackSync(): void {
  const recordTrack = useLibraryStore((s) => s.recordTrack);

  useEffect(() => {
    let lastKey = '';
    let previousTrack: MusicTrack | null = null;
    let previousKey = '';
    let previousTime = 0;
    let previousDuration = 0;
    const unsub = playerController.subscribe((snap) => {
      if (snap.current) {
        const key = snap.current.source + ':' + snap.current.id;
        if (key !== lastKey) {
          if (previousTrack && previousKey) {
            const completed = previousDuration > 0 && previousTime / previousDuration >= 0.8;
            logListeningEvent(completed ? 'completed' : 'skipped', previousTrack, { positionSec: previousTime, source: 'player.transition' });
          }
          lastKey = key;
          recordTrack(snap.current);
          logListeningEvent('started', snap.current, { source: 'player' });
          // OS-level "now playing" toast while the app is in the background.
          notifyNowPlaying(snap.current);
        } else if (previousKey === key && previousTime > 4 && snap.currentTime < 1) {
          logListeningEvent('repeated', snap.current, { source: 'player.repeat' });
        }
        previousTrack = snap.current;
        previousKey = key;
        previousTime = snap.currentTime;
        previousDuration = snap.duration;
      }
    });
    return unsub;
  }, [recordTrack]);
}
