import { useEffect } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useCoverPalette } from '@/utils/coverPalette';
import { accentFromCover, fallbackPalette } from '@/utils/palette';

/**
 * Artwork-derived colors.
 *
 * Two scopes: `--am-track-accent` always follows the best palette available for
 * the current artwork, and `--am-accent` — which repaints the whole app — only
 * follows it with the "跟随封面取色" opt-in.
 *
 * The global accent deliberately does not move until the cover's own colours
 * have been extracted; see `accentFromCover` for why.
 */
export function MonetAccent() {
  const current = usePlayerStore((s) => s.current);
  const dynamicAccent = useSettingsStore((s) => s.dynamicAccent);
  const extracted = useCoverPalette(current?.picUrl, current?.id ?? '');

  useEffect(() => {
    const root = document.documentElement;
    const accent = accentFromCover(extracted, dynamicAccent);
    if (accent !== null) {
      root.style.setProperty('--am-accent', accent);
    } else if (!dynamicAccent) {
      // The inline override has to go so the theme's own accent shows through;
      // leaving it would keep the last cover's colour forever.
      root.style.removeProperty('--am-accent');
    }
  }, [extracted, dynamicAccent]);

  // Track-scoped accent: the player is already showing this artwork, so the
  // first palette available is good enough, placeholder included. `current` is
  // a stable reference out of the queue, so this does not re-run per position
  // tick.
  useEffect(() => {
    if (!current) return;
    const palette = extracted ?? current.palette ?? fallbackPalette(current.id);
    const root = document.documentElement;
    root.style.setProperty('--am-track-accent', palette[0]);
    root.style.setProperty('--am-track-accent-soft', palette[1] ?? palette[0]);
  }, [current, extracted]);

  return null;
}
