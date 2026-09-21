import { useEffect } from 'react';
import { systemAccent } from '@/lib/nativeMedia';

/**
 * Follows the system's wallpaper palette.
 *
 * Only the accent is replaced, not the whole scheme: the app's surfaces are
 * tuned against its own dark background, and adopting a full Material You
 * palette would mean re-deriving every one of them. The accent is the part that
 * carries the "this matches my phone" impression anyway.
 *
 * Applied as an inline custom property rather than by rewriting the stylesheet,
 * so the stylesheets keep their own defaults and this is a single override that
 * can be removed by clearing one value.
 */
const KEY = 'aurora.materialYou';

export function isMaterialYouEnabled(): boolean {
  try {
    // On by default: following the system is the expected behaviour, and the
    // switch exists for people who want the app's own colour back.
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setMaterialYou(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode: the choice simply will not persist */
  }
  if (on) applyAccent();
  else clearAccent();
}

function applyAccent(): void {
  const accent = systemAccent();
  if (!accent) return;
  const root = document.documentElement;
  root.style.setProperty('--am-accent', accent);
  // The secondary is derived rather than read: system_accent2 sits far enough
  // from accent1 that gradients built from the pair look unrelated, whereas a
  // slight hue rotation reads as one family.
  root.style.setProperty('--am-accent-2', rotateHue(accent, 26));
}

function clearAccent(): void {
  const root = document.documentElement;
  root.style.removeProperty('--am-accent');
  root.style.removeProperty('--am-accent-2');
}

/** Rotates hue in HSL, which is enough for a companion tint. */
function rotateHue(hex: string, degrees: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  hue = (hue + degrees + 360) % 360;

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r2, g2, b2] =
    hue < 60 ? [c, x, 0] :
    hue < 120 ? [x, c, 0] :
    hue < 180 ? [0, c, x] :
    hue < 240 ? [0, x, c] :
    hue < 300 ? [x, 0, c] : [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r2) + toHex(g2) + toHex(b2);
}

export function useMaterialYou(): void {
  useEffect(() => {
    if (!isMaterialYouEnabled()) return;
    applyAccent();
  }, []);
}
