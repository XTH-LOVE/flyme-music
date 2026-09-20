import { useEffect, useRef } from 'react';
import { playerController } from '@/player';
import { useExtrasStore } from '@/store/useExtrasStore';
import { sleepFadeVolume } from '@/player/sleepFade';

/**
 * Global sleep-timer watcher (mount once in AppLayout):
 * - fades the volume down over the last 30s;
 * - pauses at sleepEndsAt;
 * - pauses once the track changes while stopAfterCurrent is armed.
 */
export function useSleepTimer(): void {
  const sleepEndsAt = useExtrasStore((s) => s.sleepEndsAt);
  const stopAfterCurrent = useExtrasStore((s) => s.stopAfterCurrent);
  const sleepFromVolume = useExtrasStore((s) => s.sleepFromVolume);
  const clearSleep = useExtrasStore((s) => s.clearSleep);
  const lastTrackKey = useRef<string | null>(null);

  useEffect(() => {
    if (!sleepEndsAt) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now >= sleepEndsAt) {
        playerController.pause();
        clearSleep();
        return;
      }
      const fromVolume =
        typeof sleepFromVolume === 'number' ? sleepFromVolume : playerController.snapshot().volume;
      const faded = sleepFadeVolume(now, sleepEndsAt, fromVolume);
      if (faded !== null) playerController.setVolume(faded);
    }, 500);
    return () => window.clearInterval(timer);
  }, [sleepEndsAt, sleepFromVolume, clearSleep]);

  useEffect(() => {
    if (!stopAfterCurrent) {
      lastTrackKey.current = null;
      return undefined;
    }
    const unsub = playerController.subscribe((snap) => {
      const key = snap.current ? snap.current.source + ':' + snap.current.id : null;
      if (!key) return;
      if (lastTrackKey.current === null) {
        lastTrackKey.current = key;
        return;
      }
      if (key !== lastTrackKey.current) {
        playerController.pause();
        clearSleep();
      }
    });
    return unsub;
  }, [stopAfterCurrent, clearSleep]);
}
