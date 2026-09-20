import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { analyzeInBackground, cancelBackgroundAnalysis, BACKGROUND_DELAY_MS } from '@/audio/analysis/background';
import { resetLiveHistory } from '@/audio/analysis/live';

/**
 * Quietly index tracks as they are played.
 *
 * Sound-based similarity and the taste profile both need a body of analysed
 * tracks to work on. Asking the user to trigger analysis by hand would leave
 * that pool empty forever, so it happens on its own - but only after a track has
 * genuinely been playing for a while, so skipped songs cost nothing.
 */
export function useBackgroundAnalysis(): void {
  const source = usePlayerStore((s) => s.current?.source);
  const id = usePlayerStore((s) => s.current?.id);
  const status = usePlayerStore((s) => s.status);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!source || !id || status !== 'playing') return undefined;
    const track = usePlayerStore.getState().current;
    if (!track) return undefined;

    timer.current = window.setTimeout(() => {
      void analyzeInBackground(track);
    }, BACKGROUND_DELAY_MS);

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      // Leaving the track abandons the download rather than letting it finish
      // in the background for a song the user has already moved on from.
      cancelBackgroundAnalysis();
      // Live readings compare against a few seconds ago; carrying those across a
      // track change would describe a jump between two different songs.
      resetLiveHistory();
    };
  }, [source, id, status]);
}
