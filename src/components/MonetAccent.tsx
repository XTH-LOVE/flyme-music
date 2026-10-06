import { useEffect } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useCoverPalette } from '@/utils/coverPalette';
import { accentFromCover, fallbackPalette, playerPalette, safePalette } from '@/utils/palette';

function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Artwork-derived colors.
 *
 * The player artwork supplies a soft global background wash. Text and control
 * colours keep the normal theme tokens for readability; the existing optional
 * accent setting still controls accent-coloured controls separately.
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
      root.style.removeProperty('--am-accent');
    }
  }, [extracted, dynamicAccent]);

  useEffect(() => {
    const root = document.documentElement;
    if (!current) {
      root.style.removeProperty('--am-bg-wash-a');
      root.style.removeProperty('--am-bg-wash-b');
      return;
    }
    const palette = playerPalette(
      safePalette(extracted ?? current.palette, fallbackPalette(current.id)),
    );
    root.style.setProperty('--am-bg-wash-a', rgba(palette[0], 0.22));
    root.style.setProperty('--am-bg-wash-b', rgba(palette[1] ?? palette[0], 0.14));
  }, [current, extracted]);

  // Track-scoped accent: the player is already showing this artwork, so the
  // first palette available is good enough, placeholder included. `current` is
  // a stable reference out of the queue, so this does not re-run per position
  // tick.
  useEffect(() => {
    if (!current) {
      const root = document.documentElement;
      root.style.removeProperty('--am-track-accent');
      root.style.removeProperty('--am-track-accent-soft');
      root.style.removeProperty('--am-bg-wash-a');
      root.style.removeProperty('--am-bg-wash-b');
      return;
    }
    const palette = safePalette(extracted ?? current.palette, fallbackPalette(current.id));
    const root = document.documentElement;
    root.style.setProperty('--am-track-accent', palette[0]);
    root.style.setProperty('--am-track-accent-soft', palette[1] ?? palette[0]);
  }, [current, extracted]);

  return null;
}
