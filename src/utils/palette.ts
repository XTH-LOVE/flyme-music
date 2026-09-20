const PALETTES: [string, string][] = [
  ['#3D7BFF', '#8FB0FF'],
  ['#7B4FE0', '#C8A8FF'],
  ['#2FA96B', '#A8E8C0'],
  ['#F2A65A', '#FFD8A0'],
  ['#D85A7A', '#FFB8C8'],
  ['#009A93', '#80E0D8'],
];

/** Deterministic gradient art for tracks without a palette (remote songs). */
export function fallbackPalette(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

/**
 * The global accent to apply for a cover, or `null` to leave it where it is.
 *
 * The `null` case is the whole point. While a cover's colours are still being
 * extracted there is nothing honest to fall back to: `fallbackPalette` is a
 * hash-derived placeholder with no relationship to the artwork, so applying it
 * repaints the app in an unrelated colour for a frame or two and then animates
 * to the real one - a visible flash on every track change. Holding the current
 * accent until the extraction lands is what Halcyon's `MONET_COVER` mode does,
 * for the same reason.
 *
 * A cover whose colours cannot be extracted at all keeps the theme accent,
 * which is a better answer than a colour picked by hashing its id.
 */
export function accentFromCover(
  palette: [string, string] | null,
  dynamicAccent: boolean,
): string | null {
  if (!dynamicAccent || !palette) return null;
  return palette[0];
}
