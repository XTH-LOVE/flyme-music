const PALETTES: [string, string][] = [
  ['#3D7BFF', '#8FB0FF'],
  ['#7B4FE0', '#C8A8FF'],
  ['#2FA96B', '#A8E8C0'],
  ['#F2A65A', '#FFD8A0'],
  ['#D85A7A', '#FFB8C8'],
  ['#009A93', '#80E0D8'],
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Reject malformed/transparent cover colours before they reach CSS variables. */
export function isSafeHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function safePalette(
  palette: [string, string] | null | undefined,
  fallback: [string, string] = PALETTES[0],
): [string, string] {
  const first = isSafeHexColor(palette?.[0]) ? palette[0] : fallback[0];
  const second = isSafeHexColor(palette?.[1]) ? palette[1] : first;
  return [first, second];
}

/** Stabilize colours for large player backgrounds. */
export function playerPalette(
  palette: [string, string] | null | undefined,
  fallback: [string, string] = PALETTES[0],
): [string, string] {
  const [first, second] = safePalette(palette, fallback);
  const luma = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722;
  };
  const values = [luma(first), luma(second)];
  const adjust = (hex: string, mode: 'lift' | 'lower' | 'keep') => {
    if (mode === 'keep') return hex;
    const n = Number.parseInt(hex.slice(1), 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const scale = mode === 'lift' ? 1.28 : 0.82;
    return '#' + rgb.map((v) => Math.min(220, Math.max(18, Math.round(v * scale))).toString(16).padStart(2, '0')).join('');
  };
  const mode = values.every((value) => value < 50) ? 'lift' : values.every((value) => value > 218) ? 'lower' : 'keep';
  return [adjust(first, mode), adjust(second, mode)];
}

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
  if (!dynamicAccent || !palette || !isSafeHexColor(palette[0])) return null;
  const n = Number.parseInt(palette[0].slice(1), 16);
  const luma = ((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722;
  if (luma < 42 || luma > 218) return null;
  return palette[0];
}
