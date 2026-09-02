import { useEffect } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { fallbackPalette } from '@/utils/palette';

/**
 * Keep artwork-derived colors scoped to the player. Global controls use the
 * stable theme accent so one orange cover cannot recolor the whole app.
 */
export function MonetAccent() {
  const current = usePlayerStore((s) => s.current);

  useEffect(() => {
    const root = document.documentElement;
    if (current) {
      const p = current.palette ?? fallbackPalette(current.id);
      root.style.setProperty('--am-track-accent', p[0]);
      root.style.setProperty('--am-track-accent-soft', p[1] ?? p[0]);
    }
    return undefined;
  }, [current?.id, current?.source]);

  return null;
}
