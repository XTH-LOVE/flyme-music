/**
 * Deterministic generative cover art for user playlists.
 * The name/seed picks a palette, a decorative pattern layer and a monogram,
 * so every playlist gets stable, unique-looking art with zero assets.
 */

export interface PlaylistArtSpec {
  gradient: [string, string];
  /** Decorative overlay variant, stable per seed (0-3). */
  pattern: 0 | 1 | 2 | 3;
  /** First meaningful character of the name, for the monogram. */
  initial: string;
}

const PALETTES: [string, string][] = [
  ['#3D7BFF', '#0B1B45'],
  ['#7B4FE0', '#241245'],
  ['#2FA96B', '#0B3325'],
  ['#F2A65A', '#4A2410'],
  ['#D85A7A', '#43101F'],
  ['#009A93', '#06332F'],
  ['#C8A8FF', '#3A2A55'],
  ['#FFD8A0', '#4A3A18'],
];

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** First grapheme that renders meaningfully; falls back to "♪". */
export function initialOf(name: string): string {
  const trimmed = [...name.trim().replace(/^【[^】]*】/, '')];
  for (const ch of trimmed) {
    if (ch.trim()) return ch.toUpperCase();
  }
  return '♪';
}

export function playlistArt(name: string, seed: string): PlaylistArtSpec {
  const h = hashSeed(seed || name);
  return {
    gradient: PALETTES[h % PALETTES.length],
    pattern: (Math.floor(h / 7) % 4) as PlaylistArtSpec['pattern'],
    initial: initialOf(name),
  };
}
