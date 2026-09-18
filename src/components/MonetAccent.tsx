import { useEffect } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useCoverPalette } from '@/utils/coverPalette';
import { fallbackPalette } from '@/utils/palette';

/**
 * Artwork-derived colors. Scoped to the player by default so one orange
 * cover cannot recolor the whole app; with the "跟随封面取色" opt-in the
 * global accent follows the extracted cover color instead.
 */
export function MonetAccent() {
  const current = usePlayerStore((s) => s.current);
  const dynamicAccent = useSettingsStore((s) => s.dynamicAccent);
  const extracted = useCoverPalette(current?.picUrl, current?.id ?? '');

  useEffect(() => {
    const root = document.documentElement;
    if (!current) return undefined;
    const p = extracted ?? current.palette ?? fallbackPalette(current.id);
    root.style.setProperty('--am-track-accent', p[0]);
    root.style.setProperty('--am-track-accent-soft', p[1] ?? p[0]);
    if (dynamicAccent) {
      root.style.setProperty('--am-accent', p[0]);
    } else {
      root.style.removeProperty('--am-accent');
    }
    return undefined;
    // Narrowed to the track identity on purpose: `current` is a new object on
    // every player-store update, so depending on it would re-run this on each
    // position tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [current?.id, current?.source, extracted, dynamicAccent]);

  useEffect(() => {
    // Switching the setting off must restore the theme accent immediately.
    if (!dynamicAccent) document.documentElement.style.removeProperty('--am-accent');
  }, [dynamicAccent]);

  return null;
}
