import { useEffect, useRef } from 'react';
import { playerController } from '@/player';
import { useExtrasStore } from '@/store/useExtrasStore';

/**
 * Global sleep-timer watcher (mount once in AppLayout):
 * - pauses at sleepEndsAt;
 * - pauses once the track changes while stopAfterCurrent is armed.
 */
export function useSleepTimer(): void {
  const sleepEndsAt = useExtrasStore((s) => s.sleepEndsAt);
  const stopAfterCurrent = useExtrasStore((s) => s.stopAfterCurrent);
  const clearSleep = useExtrasStore((s) => s.clearSleep);
  const lastTrackKey = useRef<string | null>(null);

  useEffect(() => {
    if (!sleepEndsAt) return undefined;
    const timer = window.setInterval(() => {
      if (Date.now() >= sleepEndsAt) {
        playerController.pause();
        clearSleep();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepEndsAt, clearSleep]);

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
