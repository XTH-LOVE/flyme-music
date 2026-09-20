import { useEffect, useState } from 'react';
import type { MusicTrack } from '@/music/source/types';

/**
 * Two-entry track stack [previous, current] that swaps when the track changes,
 * letting stacked layers crossfade (used by every cover/background layer).
 * Comparing by bare id is safe here: a layer only needs to differ visually,
 * and source changes come with a new artwork render either way.
 */
export function useCrossfadeStack(track: MusicTrack): MusicTrack[] {
  const [stack, setStack] = useState<MusicTrack[]>([track]);

  useEffect(() => {
    setStack((prev) => {
      if (prev.length && prev[prev.length - 1].id === track.id) return prev;
      return [...prev, track].slice(-2);
    });
  }, [track.id, track]);

  return stack;
}
