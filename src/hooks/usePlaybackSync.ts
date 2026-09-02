import { useEffect } from 'react';
import { playerController } from '@/player';
import { useLibraryStore } from '@/store/useLibraryStore';

/** Records every newly playing track (online or local) into recent history. */
export function usePlaybackSync(): void {
  const recordTrack = useLibraryStore((s) => s.recordTrack);

  useEffect(() => {
    let lastKey = '';
    const unsub = playerController.subscribe((snap) => {
      if (snap.current) {
        const key = snap.current.source + ':' + snap.current.id;
        if (key !== lastKey) {
          lastKey = key;
          recordTrack(snap.current);
        }
      }
    });
    return unsub;
  }, [recordTrack]);
}
